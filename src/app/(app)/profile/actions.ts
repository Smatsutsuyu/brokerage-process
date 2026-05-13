"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, users } from "@/db/schema";
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

  if (input.phone !== undefined) {
    const phone = input.phone?.trim() || null;
    await db.update(users).set({ phone }).where(eq(users.id, me.id));
  }

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
