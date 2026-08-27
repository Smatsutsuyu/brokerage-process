"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "@/db";
import { authAccount, users } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/get-current-user";

// Called from /set-password after the user has signed in with the temp
// password an owner handed them. Same scrypt hash Better Auth uses on
// its own routes (both call @better-auth/utils/password under the hood).
// The user has already proven identity via the sign-in step, so no
// current-password prompt is needed.
export async function setOwnPassword(input: { newPassword: string }): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const newPassword = input.newPassword;
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const hashed = await hashPassword(newPassword);

  // Better Auth stores the email/password credential row under
  // providerId = "credential" (confirmed in its own sign-up + update-user
  // routes). Update in place — the row is guaranteed to exist because the
  // user just signed in successfully with the temp password.
  await db
    .update(authAccount)
    .set({ password: hashed })
    .where(
      and(eq(authAccount.userId, me.authUserId), eq(authAccount.providerId, "credential")),
    );

  await db.update(users).set({ mustSetPassword: false }).where(eq(users.id, me.id));

  // A password change is a security event, so it gets a row. Nothing about
  // the password goes in it: not the plaintext, not the hash, not the
  // length. Same deliberate silence as the admin-side member.password_reset
  // entry, which records only that the action happened.
  await writeAudit({
    orgId: me.orgId,
    userId: me.id,
    action: "profile.password_changed",
    entityType: "user",
    entityId: me.id,
    metadata: {
      label: truncateForAudit(me.name),
      // True when this closes out an owner-triggered reset (the /set-password
      // gate forced the visit) rather than a voluntary change, which pairs
      // the entry with the member.password_reset that preceded it.
      afterOwnerReset: me.mustSetPassword,
    },
  });

  // Invalidate cached layouts so the (app) gate re-reads the cleared flag
  // on the very next navigation.
  revalidatePath("/", "layout");
}
