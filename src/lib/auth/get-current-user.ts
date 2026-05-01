import { db } from "@/db";

// Placeholder until Clerk is wired. Returns the first user in the DB
// (Chris's seeded user). Once Clerk middleware is enforcing auth, replace
// this with a lookup by clerk_user_id from auth() / currentUser().
export async function getCurrentUser() {
  return db.query.users.findFirst();
}
