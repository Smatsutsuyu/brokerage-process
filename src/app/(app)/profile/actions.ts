"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, users } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function updateMyProfile(input: {
  name: string;
  phone?: string | null;
}): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");

  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  // Identity (name) lives on auth_user. Phone lives on our app-level
  // users row (Better Auth doesn't model phone). Two writes — one per
  // table — but only when the corresponding field changed.
  await db.update(authUser).set({ name }).where(eq(authUser.id, me.authUserId));

  // Held outside the branch because the audit entry needs the resulting
  // phone either way: omitting the field leaves the stored one in place.
  let nextPhone = me.phone;
  if (input.phone !== undefined) {
    nextPhone = input.phone?.trim() || null;
    await db.update(users).set({ phone: nextPhone }).where(eq(users.id, me.id));
  }

  // A name change shows up on other people's screens (sidebar, deal team,
  // issue assignees), so it is worth a row. Skipped when the form saved the
  // values it already had, which is what a stray Save click does.
  if (name !== me.name || nextPhone !== me.phone) {
    await writeAudit({
      orgId: me.orgId,
      userId: me.id,
      action: "profile.updated",
      entityType: "user",
      entityId: me.id,
      // Both fields are client-supplied text with no cap in the schema.
      before: { name: truncateForAudit(me.name), phone: truncateForAudit(me.phone) },
      after: { name: truncateForAudit(name), phone: truncateForAudit(nextPhone) },
      metadata: { label: truncateForAudit(name) },
    });
  }

  revalidatePath("/profile");
  // Sidebar shows the user's name — refresh anywhere it might appear.
  revalidatePath("/", "layout");
}

// Per-channel feedback notification preference. Owner-only — non-owners
// have no UI surface for this and the recipient query in notify.ts also
// filters by role.
export type NotificationChannel =
  | "newFeedback"
  | "newComment"
  | "replyToMine"
  | "statusChangeToMine";

export async function setMyNotificationPreference(input: {
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "owner") throw new Error("Owner-only");

  const update =
    input.channel === "newFeedback"
      ? { notifyOnNewFeedback: input.enabled }
      : input.channel === "newComment"
        ? { notifyOnNewComment: input.enabled }
        : input.channel === "replyToMine"
          ? { notifyOnReplyToMine: input.enabled }
          : { notifyOnStatusChangeToMine: input.enabled };

  await db.update(users).set(update).where(eq(users.id, me.id));
  revalidatePath("/profile");
}
