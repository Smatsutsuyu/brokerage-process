import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Fire-and-forget audit write for owner-only mutations. Errors are
// swallowed so a failed audit never breaks the mutation itself (the row
// on `users` / `deal_buyers` / etc. is authoritative; audit is a
// secondary journal). Callers should still `await` this so the write is
// attempted before the response returns, but they don't have to guard
// against it throwing.
//
// Convention:
//   action     - "<entity>.<past_tense_verb>", e.g. "member.invited"
//   entityType - the noun the entry is about, e.g. "user"
//   entityId   - the target row's UUID (nullable — action might not be
//                row-scoped, e.g. bulk imports)
//   userId     - the ACTOR (who performed the action), nullable to
//                accommodate system-triggered entries
//   before / after / metadata - jsonb snapshots. Never write plaintext
//                passwords, tokens, or PII beyond what's already stored
//                on the target row.
export async function writeAudit(entry: {
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      orgId: entry.orgId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.warn("[audit] failed to write entry", { action: entry.action, err });
  }
}
