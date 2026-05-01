import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";

import { getCurrentUser } from "./get-current-user";

// Resolves the signed-in user's org. Single-tenant for now (one Lakebridge
// org), but the lookup goes through the user → org_id link so adding a
// second org later wouldn't require touching every caller.
export async function getCurrentOrg() {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.query.organizations.findFirst({
    where: eq(organizations.id, user.orgId),
  });
}
