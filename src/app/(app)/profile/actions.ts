"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function updateMyProfile(input: { name: string }): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");

  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  // Identity (name) lives on auth_user — this is the only write site.
  await db.update(authUser).set({ name }).where(eq(authUser.id, me.authUserId));

  revalidatePath("/profile");
  // Sidebar shows the user's name — refresh anywhere it might appear.
  revalidatePath("/", "layout");
}

// Self-toggle for the developer-mode flag. Owner-only — non-owners with
// the flag set are ignored by the notification query anyway, but we gate
// the toggle in UI + here so the flag stays semantically meaningful.
export async function setMyDeveloperMode(enabled: boolean): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "owner") throw new Error("Owner-only");

  await db.update(users).set({ isDeveloper: enabled }).where(eq(users.id, me.id));
  revalidatePath("/profile");
}

// Per-channel notification preference. Only meaningful when isDeveloper
// is true; we still allow toggling it when false so the user can pre-set
// preferences before flipping developer mode on.
export type NotificationChannel = "newFeedback" | "newComment";

export async function setMyNotificationPreference(input: {
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");

  const update =
    input.channel === "newFeedback"
      ? { notifyOnNewFeedback: input.enabled }
      : { notifyOnNewComment: input.enabled };

  await db.update(users).set(update).where(eq(users.id, me.id));
  revalidatePath("/profile");
}
