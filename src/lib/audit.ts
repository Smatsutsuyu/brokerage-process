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

// Metadata convention
// -------------------
// `writeAudit` accepts arbitrary jsonb in `metadata`, but the audit viewer
// (`/admin/audit`) reads three optional well-known keys so an entry renders
// as a sentence without joining back to the row it describes:
//
//   dealId   - the deal the entry belongs to. Renders as a link to the deal
//              and drives the viewer's per-deal filter. Prefer the value
//              read back from the database over the client-supplied one.
//   dealName - denormalized deal name. The audit row must stay readable
//              after the deal is renamed or deleted, so it is copied in
//              rather than joined.
//   label    - human name of the target row ("Offering Date", "Lennar").
//              Without it the viewer can only show a bare UUID.
//
// Anything else in `metadata` is action-specific and renders in the
// expanded detail panel as-is.
export type AuditMetadata = {
  dealId?: string | null;
  dealName?: string | null;
  label?: string | null;
  [key: string]: unknown;
};

// Free-text columns (checklist_items.notes, issues.description, buyer
// comments) have no length cap in the schema, so a before/after snapshot
// can carry an unbounded string into jsonb. Cap it: the audit trail exists
// to answer "who changed this and roughly to what", not to be a second
// copy of the content.
export function truncateForAudit(
  value: string | null | undefined,
  max = 500,
): string | null {
  if (value === null || value === undefined) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… (${value.length - max} more characters)`;
}
