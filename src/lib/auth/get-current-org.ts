import { db } from "@/db";

// Placeholder until Clerk is wired. Returns the first org in the DB.
// Once Clerk middleware is enforcing auth, replace this with:
//   - Read the Clerk org ID from auth() / currentUser()
//   - Look up the org row by clerk_org_id
export async function getCurrentOrg() {
  return db.query.organizations.findFirst();
}
