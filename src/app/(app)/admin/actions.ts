"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "@/db";
import { authAccount, authSession, authUser, dealTeamMembers, users } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type Role = "owner" | "broker" | "analyst" | "viewer";

async function requireOwner() {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "owner") throw new Error("Owner role required");
  return me;
}

export async function inviteMember(input: {
  email: string;
  name: string;
  role: Role;
  initialPassword: string;
}): Promise<void> {
  const me = await requireOwner();
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email) throw new Error("Email is required");
  if (!name) throw new Error("Name is required");
  if (input.initialPassword.length < 8) {
    throw new Error("Initial password must be at least 8 characters");
  }

  // Reject duplicates by checking auth_user (which holds email + has its own
  // unique index on email anyway, so this is a friendlier error message).
  const existingAuth = await db.query.authUser.findFirst({
    where: eq(authUser.email, email),
  });
  if (existingAuth) throw new Error("A member with that email already exists");

  // Snapshot the inviter's session cookie BEFORE signUpEmail. Better Auth
  // is configured with autoSignIn=true (correct for the regular flow), so
  // signUpEmail's after-hook writes a Set-Cookie for the new user's
  // session — overwriting the inviter's session and effectively logging
  // them out. We restore the inviter's cookie below to undo that.
  const ctx = await auth.$context;
  const sessionCookieMeta = ctx.authCookies.sessionToken;
  const cookieStore = await cookies();
  const inviterToken = cookieStore.get(sessionCookieMeta.name)?.value;

  const result = await auth.api.signUpEmail({
    body: { name, email, password: input.initialPassword },
  });

  // Restore the inviter's session cookie so they stay signed in.
  // Attributes mirror Better Auth's own (httpOnly, sameSite=lax,
  // secure-in-prod, path=/) so the next request validates correctly.
  // Normalize sameSite to lowercase since Better Auth allows
  // "Strict"/"Lax"/"None" but Next's ResponseCookie type is strict.
  if (inviterToken) {
    const a = sessionCookieMeta.attributes;
    const normalizedSameSite =
      typeof a.sameSite === "string"
        ? (a.sameSite.toLowerCase() as "lax" | "strict" | "none")
        : a.sameSite;
    cookieStore.set(sessionCookieMeta.name, inviterToken, {
      httpOnly: a.httpOnly,
      secure: a.secure,
      sameSite: normalizedSameSite,
      path: a.path,
      domain: a.domain,
      maxAge: a.maxAge,
    });
  }

  // signUpEmail also created an auth_session row for the new user that
  // will never be used (we just discarded their cookie). Best-effort
  // cleanup so we don't accumulate orphan sessions; harmless if it fails.
  try {
    await db.delete(authSession).where(eq(authSession.userId, result.user.id));
  } catch (err) {
    console.warn("[invite] failed to clean up new user's orphan session", err);
  }

  // .returning() with no args to sidestep the driver-shape difference between
  // neon-serverless and postgres-js (see dedupe-builders.ts note).
  const [inserted] = await db
    .insert(users)
    .values({
      orgId: org.id,
      authUserId: result.user.id,
      role: input.role,
    })
    .returning();

  await writeAudit({
    orgId: org.id,
    userId: me.id,
    action: "member.invited",
    entityType: "user",
    entityId: inserted?.id ?? null,
    after: {
      email: truncateForAudit(email),
      name: truncateForAudit(name),
      role: input.role,
    },
    // The viewer renders metadata.label as its Target column and searches on
    // it, so without this the most security-sensitive entries in the log are
    // unfindable by the member's own name.
    metadata: { label: truncateForAudit(name) },
  });

  revalidatePath("/admin/members");
}

// A member can sit on every deal in the org, so the Deal Team rows the removal
// destroys are listed under a cap and paired with the full count. Same value as
// the deal page's bulk-list cap so the two agree on how much detail an entry
// keeps.
const AUDIT_DEAL_TEAM_ROW_CAP = 50;

// Hard-deletes a member: drops the membership row AND the auth identity.
// Cascades clean up auth_session + auth_account via the FK with onDelete
// cascade. The contact's email becomes available for a fresh invite.
//
// Owner can't remove themselves. Owner can't remove the only remaining
// owner — leaving an org without an owner would lock everyone else out
// of /admin and break the role-management flow.
export async function removeMember(input: { userId: string }): Promise<void> {
  const me = await requireOwner();
  if (input.userId === me.id) {
    throw new Error("You can't remove your own account");
  }

  // Lookup the target + sanity-check the owner-count invariant when
  // removing another owner. Name + email come along for the audit entry: the
  // auth_user row is deleted below, so this is the last chance to record who
  // was removed.
  const [target] = await db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      role: users.role,
      name: authUser.name,
      email: authUser.email,
    })
    .from(users)
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)))
    .limit(1);
  if (!target) throw new Error("Member not found");

  if (target.role === "owner") {
    const ownerCount = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, me.orgId), eq(users.role, "owner")));
    if (ownerCount.length <= 1) {
      throw new Error("Can't remove the only remaining owner");
    }
  }

  // The transaction below hard-deletes this person's Deal Team rows. The
  // single-row path on the deal page (removeDealTeamMember) writes a
  // deal_team_member.removed entry for exactly that destruction, so without
  // this read the same loss leaves no trace at all when it happens through
  // member removal instead. Read before the delete, since afterwards the rows
  // are gone; org-scoped like every other read in this file. A throw here
  // fails closed and the member is not removed, which is the safe direction.
  const dealTeamRows = await db
    .select({
      id: dealTeamMembers.id,
      dealId: dealTeamMembers.dealId,
      team: dealTeamMembers.team,
      roleLabel: dealTeamMembers.roleLabel,
      includeInEmails: dealTeamMembers.includeInEmails,
    })
    .from(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.userId, input.userId),
        eq(dealTeamMembers.orgId, me.orgId),
      ),
    );

  // Delete in transaction: membership row first (FK to authUser is
  // onDelete set null, so this would orphan), then the auth identity.
  // Cascades on auth_session + auth_account drop them automatically.
  //
  // Deal Team rows referencing this user need a hard detach first. The
  // FK is onDelete set null, but `deal_team_members` has a CHECK that
  // requires at least one of userId / contactId / name to be non-null —
  // so a SET NULL on a user-only row would violate the constraint and
  // abort the user delete. Drop those rows instead of trying to
  // preserve them as orphaned free-text entries.
  await db.transaction(async (tx) => {
    await tx.delete(dealTeamMembers).where(eq(dealTeamMembers.userId, input.userId));
    await tx.delete(users).where(eq(users.id, input.userId));
    if (target.authUserId) {
      await tx.delete(authAccount).where(eq(authAccount.userId, target.authUserId));
      await tx.delete(authSession).where(eq(authSession.userId, target.authUserId));
      await tx.delete(authUser).where(eq(authUser.id, target.authUserId));
    }
  });

  // Post-transaction so a failed audit can't rescue a bad delete. entityId
  // is the target's now-nonexistent uuid — safe because audit_log.entity_id
  // has no FK, and we set userId on audit rows to SET NULL on user delete.
  await writeAudit({
    orgId: me.orgId,
    userId: me.id,
    action: "member.removed",
    entityType: "user",
    entityId: input.userId,
    before: {
      role: target.role,
      name: truncateForAudit(target.name),
      email: truncateForAudit(target.email),
    },
    metadata: {
      label: truncateForAudit(target.name ?? target.email),
      // What the Deal Team sweep took with it. roleLabel is uncapped text on
      // the row, so it goes through the truncator like any other free text
      // reaching jsonb.
      removedDealTeamRowCount: dealTeamRows.length,
      removedDealTeamRows: dealTeamRows
        .slice(0, AUDIT_DEAL_TEAM_ROW_CAP)
        .map((r) => ({
          id: r.id,
          dealId: r.dealId,
          team: r.team,
          roleLabel: truncateForAudit(r.roleLabel),
          includeInEmails: r.includeInEmails,
        })),
      removedDealTeamRowsTruncated: dealTeamRows.length > AUDIT_DEAL_TEAM_ROW_CAP,
    },
  });

  revalidatePath("/admin/members");
}

export async function changeMemberRole(input: { userId: string; role: Role }): Promise<void> {
  const me = await requireOwner();
  if (input.userId === me.id) {
    throw new Error("You can't change your own role");
  }

  const [prev] = await db
    .select({
      role: users.role,
      name: authUser.name,
      email: authUser.email,
    })
    .from(users)
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)))
    .limit(1);
  if (!prev) throw new Error("Member not found");
  if (prev.role === input.role) {
    // No-op, no audit noise.
    return;
  }

  await db
    .update(users)
    .set({ role: input.role })
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)));

  await writeAudit({
    orgId: me.orgId,
    userId: me.id,
    action: "member.role_changed",
    entityType: "user",
    entityId: input.userId,
    before: { role: prev.role },
    after: { role: input.role },
    metadata: { label: truncateForAudit(prev.name ?? prev.email) },
  });

  revalidatePath("/admin/members");
}

export async function setMemberDisabled(input: {
  userId: string;
  disabled: boolean;
}): Promise<void> {
  const me = await requireOwner();
  if (input.userId === me.id) {
    throw new Error("You can't disable your own account");
  }

  const [prev] = await db
    .select({
      disabledAt: users.disabledAt,
      name: authUser.name,
      email: authUser.email,
    })
    .from(users)
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)))
    .limit(1);
  if (!prev) throw new Error("Member not found");
  const wasDisabled = prev.disabledAt !== null;
  if (wasDisabled === input.disabled) {
    // Already in the requested state, no audit noise.
    return;
  }
  const nextDisabledAt = input.disabled ? new Date() : null;

  await db
    .update(users)
    .set({ disabledAt: nextDisabledAt })
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)));

  await writeAudit({
    orgId: me.orgId,
    userId: me.id,
    action: input.disabled ? "member.disabled" : "member.re_enabled",
    entityType: "user",
    entityId: input.userId,
    before: { disabledAt: prev.disabledAt },
    after: { disabledAt: nextDisabledAt },
    metadata: { label: truncateForAudit(prev.name ?? prev.email) },
  });

  revalidatePath("/admin/members");
}

// Owner-triggered password reset. Overwrites the target's credential-account
// password with the provided temp string, flips users.must_set_password so
// the (app) layout gate forces a /set-password redirect on their next
// request, and invalidates all their existing sessions so a stale browser
// tab can't slip past the gate. Returns nothing — the modal already knows
// the temp password it just sent in.
//
// Owner can't reset their own account: use the Better Auth changePassword
// flow via a profile-page control (not built yet). Owner can't reset
// another owner unless they'd also be able to remove them (skip the
// last-owner floor here because reset doesn't destroy access — the target
// can still recover as long as one owner remains — but leave the block on
// self-reset to keep the "prove identity via sign-in" invariant intact).
export async function resetMemberPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<void> {
  const me = await requireOwner();
  if (input.userId === me.id) {
    throw new Error("You can't reset your own password from this flow");
  }
  if (input.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  const [target] = await db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      name: authUser.name,
      email: authUser.email,
    })
    .from(users)
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)))
    .limit(1);
  if (!target) throw new Error("Member not found");
  if (!target.authUserId) throw new Error("Member has no auth identity");

  const hashed = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(authAccount)
      .set({ password: hashed })
      .where(
        and(
          eq(authAccount.userId, target.authUserId!),
          eq(authAccount.providerId, "credential"),
        ),
      );
    await tx
      .update(users)
      .set({ mustSetPassword: true })
      .where(eq(users.id, target.id));
    // Kick them out of any active session — a stale browser tab shouldn't
    // outlast a reset.
    await tx.delete(authSession).where(eq(authSession.userId, target.authUserId!));
  });

  // Note: we deliberately do NOT store the plaintext temp password (or its
  // hash) on the audit row. The action's existence is enough; the reset
  // modal already shows the password once to the owner.
  await writeAudit({
    orgId: me.orgId,
    userId: me.id,
    action: "member.password_reset",
    entityType: "user",
    entityId: input.userId,
    metadata: { label: truncateForAudit(target.name ?? target.email) },
  });

  revalidatePath("/admin/members");
}
