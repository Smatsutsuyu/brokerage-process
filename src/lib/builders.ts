// Shared builder lookup helper. Used by every code path that might
// insert a row into `builders` so we never create case-insensitive /
// whitespace-different duplicates within an org.
//
// The DB has a unique index on (org_id, lower(trim(name))) as the
// ultimate guard, but app-level callers should use this helper to do
// the lookup themselves so they can branch on the result (return the
// existing id quietly, or throw a user-facing error from a form).

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { builders } from "@/db/schema";

// Accept either the `db` instance or a transaction handle. The
// transaction type is pulled out of the callback parameter of
// `db.transaction`, which avoids importing Drizzle internals while
// still typing the union precisely.
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Client = typeof db | TxClient;

// Normalizes the way the DB unique index does: trim + lower-case. Keep
// these in lock-step or the app guard will let through writes that
// then collide with the index.
export function normalizeBuilderName(name: string): string {
  return name.trim().toLowerCase();
}

export async function findBuilderByName(
  client: Client,
  orgId: string,
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeBuilderName(rawName);
  if (!normalized) return null;
  const rows = await client
    .select({ id: builders.id, name: builders.name })
    .from(builders)
    .where(and(eq(builders.orgId, orgId), sql`lower(trim(${builders.name})) = ${normalized}`))
    .limit(1);
  return rows[0] ?? null;
}
