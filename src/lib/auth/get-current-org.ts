import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";

import { getCurrentUser } from "./get-current-user";

// Wrapped in React's cache() so the page + sidebar + any other
// org-resolving call within a single request share one DB round-trip.
export const getCurrentOrg = cache(_getCurrentOrg);

// Resolves the signed-in user's org. Single-tenant for now (one Lakebridge
// org), but the lookup goes through the user → org_id link so adding a
// second org later wouldn't require touching every caller.
async function _getCurrentOrg() {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.query.organizations.findFirst({
    where: eq(organizations.id, user.orgId),
  });
}
