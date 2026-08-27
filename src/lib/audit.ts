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

// Post-mutation audit work
// ------------------------
// writeAudit swallows its own errors so a failed audit can never break the
// mutation it observes. That contract covers the INSERT and nothing else.
//
// A snapshot SELECT that runs BEFORE the mutation is already safe: if it
// throws, the mutation never happens, which fails closed. But a read that runs
// AFTER the mutation has committed sits outside the contract entirely. If it
// throws, the action throws too, having already written the row, and the caller
// reports a failure for something that actually succeeded. That is strictly
// worse than having no audit trail: an upload that landed gets reported as
// "Upload failed" and the UI skips its refresh.
//
// So: any audit-only work that happens after the write goes through here.
// Loading a name to label the entry is never worth failing a mutation for.
export async function auditSafely(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.warn("[audit] post-mutation audit step failed", err);
  }
}

// Naming convention
// -----------------
// `action` is "<domain>.<past_tense_verb>" and `entityType` is the table the
// row lives in. These two deliberately do NOT have to match, and several pairs
// don't:
//
//   action "member.password_reset"  entityType "user"
//   action "profile.updated"        entityType "user"
//   action "feedback.status_changed" entityType "feedback_item"
//
// The action prefix names the domain a person thinks in ("member", "profile"),
// which is what reads well in the viewer's Action filter. entityType names the
// table, which is what makes entity_id meaningful. Reviewers reliably read this
// as an inconsistency and try to "fix" it: don't. Renaming an action string
// orphans every row already written under the old one, and the pairs above are
// live in production.
//
// Split set from clear, and add from remove, when the distinction earns its own
// row in the Action filter. Sub-variants that don't (which of two dates moved,
// say) ride in `metadata` instead.
//
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
