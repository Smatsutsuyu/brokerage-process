"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
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
  firstName: string;
  lastName: string;
  role: Role;
  initialPassword: string;
}): Promise<void> {
  await requireOwner();
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!email) throw new Error("Email is required");
  if (!firstName || !lastName) throw new Error("First and last name are required");
  if (input.initialPassword.length < 8) {
    throw new Error("Initial password must be at least 8 characters");
  }

  // Reject duplicates inside this org. (auth_user.email has its own unique
  // index, which would surface as a database error otherwise.)
  const existing = await db.query.users.findFirst({
    where: and(eq(users.orgId, org.id), eq(users.email, email)),
  });
  if (existing) throw new Error("A member with that email already exists");

  // Use Better Auth to create the credential — it hashes the password for us.
  const result = await auth.api.signUpEmail({
    body: {
      name: `${firstName} ${lastName}`,
      email,
      password: input.initialPassword,
    },
  });

  await db.insert(users).values({
    orgId: org.id,
    authUserId: result.user.id,
    email,
    firstName,
    lastName,
    role: input.role,
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
