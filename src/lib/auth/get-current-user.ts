import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { auth } from "./auth";

// Resolves the signed-in user. Returns null when there's no session, or when
// the auth user has no app-level membership row (which shouldn't happen
// after the owner invites them, but we guard anyway).
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.authUserId, session.user.id),
  });
  if (!row) return null;
  if (row.disabledAt) return null;
  return row;
}
