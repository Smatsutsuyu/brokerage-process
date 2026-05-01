import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, users } from "@/db/schema";

import { auth } from "./auth";

// The shape every consumer reads. Joins auth_user (identity) onto users
// (membership) so callers don't have to know about the two-table layout.
export type CurrentUser = {
  id: string;
  orgId: string;
  authUserId: string;
  role: "owner" | "broker" | "analyst" | "viewer";
  disabledAt: Date | null;
  email: string;
  name: string;
};

// Resolves the signed-in user. Returns null when there's no session, when
// the membership row is missing, or when the member is disabled.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const [row] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      authUserId: users.authUserId,
      role: users.role,
      disabledAt: users.disabledAt,
      email: authUser.email,
      name: authUser.name,
    })
    .from(users)
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(eq(users.authUserId, session.user.id))
    .limit(1);

  if (!row) return null;
  if (row.disabledAt) return null;
  // Narrow authUserId from `string | null` to `string` — the JOIN guarantees
  // it's set, but the column type is nullable.
  if (!row.authUserId) return null;

  return {
    id: row.id,
    orgId: row.orgId,
    authUserId: row.authUserId,
    role: row.role,
    disabledAt: row.disabledAt,
    email: row.email,
    name: row.name,
  };
}
