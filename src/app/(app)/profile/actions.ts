"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser } from "@/db/schema";
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
