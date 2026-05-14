"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { authAccount, authSession, authUser, dealTeamMembers, users } from "@/db/schema";
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
  await requireOwner();
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

  await db.insert(users).values({
    orgId: org.id,
    authUserId: result.user.id,
    role: input.role,
  });

  revalidatePath("/admin/members");
}

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
  // removing another owner.
  const [target] = await db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      role: users.role,
    })
    .from(users)
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

  revalidatePath("/admin/members");
}

export async function changeMemberRole(input: { userId: string; role: Role }): Promise<void> {
  const me = await requireOwner();
  if (input.userId === me.id) {
    throw new Error("You can't change your own role");
  }

  await db
    .update(users)
    .set({ role: input.role })
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)));

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

  await db
    .update(users)
    .set({ disabledAt: input.disabled ? new Date() : null })
    .where(and(eq(users.id, input.userId), eq(users.orgId, me.orgId)));

  revalidatePath("/admin/members");
}
