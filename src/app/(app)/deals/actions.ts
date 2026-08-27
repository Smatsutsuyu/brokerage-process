"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { del } from "@vercel/blob";

import { db } from "@/db";
import { seedChecklistForDeal } from "@/db/seed-checklist";
import {
  checklistCategories,
  checklistItems,
  consultants,
  dealBuyers,
  dealContacts,
  dealTeamMembers,
  deals,
  documents,
  issues,
  qaItems,
} from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type DealPriority = "normal" | "high";

export type DealInput = {
  name: string;
  units?: number | null;
  city?: string;
  state?: string;
  type?: string;
  priority: DealPriority;
  // Final purchase price in whole dollars. Null / undefined until the
  // Phase 4 milestone lands. Numeric column persists precise value.
  purchasePrice?: number | null;
  notes?: string;
};

// The deal columns worth diffing in the audit log. Excludes bookkeeping
// (createdAt / updatedAt) and the columns other actions own (archivedAt,
// psaDrafting, bannerImagePath).
const AUDITED_DEAL_FIELDS = [
  "name",
  "units",
  "city",
  "state",
  "type",
  "priority",
  "purchasePrice",
  "notes",
] as const;

// Every mutation below is blind (update / delete with no prior read), so
// the before values for an audit entry only exist if we go and fetch them.
// One shape serves all of them: updateDeal diffs the business fields,
// archive / unarchive read archivedAt to tell a real state change from a
// repeat click, and both need the name for the viewer's label column.
async function loadDealAuditContext(dealId: string, orgId: string) {
  const [row] = await db
    .select({
      name: deals.name,
      units: deals.units,
      city: deals.city,
      state: deals.state,
      type: deals.type,
      priority: deals.priority,
      purchasePrice: deals.purchasePrice,
      notes: deals.notes,
      archivedAt: deals.archivedAt,
    })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function createDeal(input: DealInput): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Deal name is required");

  // Insert deal + auto-populate the canonical 4-phase checklist from the
  // shared template so a UI-created deal looks identical to a seeded one.
  // Note: Neon HTTP driver doesn't support transactions, so writes happen
  // sequentially. If the checklist insert fails partway, manual cleanup of
  // the orphan deal is needed — acceptable trade-off for now since the
  // template is fully static and has been exercised via seed many times.
  const [created] = await db
    .insert(deals)
    .values({
      orgId: org.id,
      name,
      units: input.units ?? null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      type: input.type?.trim() || null,
      priority: input.priority,
      // Drizzle's numeric() column expects a string on write; toFixed(2)
      // keeps the DB value stable regardless of client-side formatting.
      purchasePrice:
        input.purchasePrice != null ? input.purchasePrice.toFixed(2) : null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  // Logged before the checklist seed so the trail survives the orphan-deal
  // case described above: if the seed throws, the deal row still exists and
  // the log still says who created it.
  const user = await getCurrentUser();
  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "deal.created",
    entityType: "deal",
    entityId: created.id,
    // name / city / state / type are uncapped text columns the form never
    // length-limits, so every string here is truncated the way updateDeal
    // already truncates the same columns.
    after: {
      name: truncateForAudit(created.name),
      units: created.units,
      city: truncateForAudit(created.city),
      state: truncateForAudit(created.state),
      type: truncateForAudit(created.type),
      priority: created.priority,
      purchasePrice: created.purchasePrice,
      notes: truncateForAudit(created.notes),
    },
    metadata: {
      dealId: created.id,
      dealName: truncateForAudit(created.name),
      label: truncateForAudit(created.name),
    },
  });

  await seedChecklistForDeal(db, { orgId: org.id, dealId: created.id });

  revalidatePath("/");
  return created.id;
}

export async function updateDeal(
  dealId: string,
  input: DealInput,
): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Deal name is required");

  // Held in a const so the audit diff below compares against exactly what
  // was written instead of recomputing the same trims.
  const next = {
    name,
    units: input.units ?? null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    type: input.type?.trim() || null,
    priority: input.priority,
    purchasePrice:
      input.purchasePrice != null ? input.purchasePrice.toFixed(2) : null,
    notes: input.notes?.trim() || null,
  };

  const user = await getCurrentUser();
  const before = await loadDealAuditContext(dealId, org.id);

  await db
    .update(deals)
    .set(next)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  if (before) {
    // Log only the fields that actually moved. The edit form submits every
    // field on every save, so a full before / after pair would bury the one
    // value an operator came to the log for.
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    for (const key of AUDITED_DEAL_FIELDS) {
      const previous = before[key];
      const value = next[key];
      if (previous === value) continue;
      changedBefore[key] =
        typeof previous === "string" ? truncateForAudit(previous) : previous;
      changedAfter[key] =
        typeof value === "string" ? truncateForAudit(value) : value;
    }

    if (Object.keys(changedAfter).length > 0) {
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "deal.updated",
        entityType: "deal",
        entityId: dealId,
        before: changedBefore,
        after: changedAfter,
        // dealName / label are the post-edit name so a rename files the
        // entry under the name the deal answers to now. The old name is
        // still in `before` when the rename itself is what changed.
        metadata: {
          dealId,
          dealName: truncateForAudit(next.name),
          label: truncateForAudit(next.name),
        },
      });
    }
  }

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
}

// Archive: soft-hide from the sidebar + priority ribbon. Reversible.
// Sets archivedAt to now(); unarchive clears it. UI keeps the deal page
// itself fully functional when archived — the pill on the header is the
// only visual signal.
export async function archiveDeal(dealId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealAuditContext(dealId, org.id);

  const archivedAt = new Date();
  await db
    .update(deals)
    .set({ archivedAt })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  // Archiving an already-archived deal only pushes the timestamp forward,
  // which is not a state change worth a row in the log.
  if (before && !before.archivedAt) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal.archived",
      entityType: "deal",
      entityId: dealId,
      before: { archivedAt: null },
      after: { archivedAt },
      metadata: {
        dealId,
        dealName: truncateForAudit(before.name),
        label: truncateForAudit(before.name),
      },
    });
  }

  revalidatePath(`/deals/${dealId}`);
  // Revalidate the (app) layout so PriorityRibbon (rendered in the layout,
  // not any single page) re-queries and drops the newly-archived deal.
  revalidatePath("/", "layout");
}

export async function unarchiveDeal(dealId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealAuditContext(dealId, org.id);

  await db
    .update(deals)
    .set({ archivedAt: null })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  // Only log when the deal was actually archived to begin with.
  if (before && before.archivedAt) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal.unarchived",
      entityType: "deal",
      entityId: dealId,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      metadata: {
        dealId,
        dealName: truncateForAudit(before.name),
        label: truncateForAudit(before.name),
      },
    });
  }

  revalidatePath(`/deals/${dealId}`);
  // Layout-scope revalidate so PriorityRibbon picks up the newly-active deal.
  revalidatePath("/", "layout");
}

// Hard delete. Requires the deal to be archived first (archivedAt is not
// null). The two-step gate is the point — a full-blast-radius destructive
// action shouldn't be reachable behind a single click + confirm. Attempting
// to delete an active deal throws, which the client-side flow won't hit
// because the Delete menu item is only exposed on archived deals; the
// server check is defense in depth.
export async function deleteDeal(dealId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Preflight: only proceed if the deal exists in this org AND is archived.
  // We fetch the archive gate here (before wiping blobs) so a caller
  // trying to delete an active or foreign deal doesn't get partial cleanup.
  //
  // The identifying fields come back in the same round-trip purely for the
  // audit entry at the bottom: once the cascade runs, that entry is the only
  // surviving record that this deal ever existed.
  const [preflight] = await db
    .select({
      id: deals.id,
      archivedAt: deals.archivedAt,
      bannerImagePath: deals.bannerImagePath,
      name: deals.name,
      units: deals.units,
      city: deals.city,
      state: deals.state,
      type: deals.type,
      priority: deals.priority,
      purchasePrice: deals.purchasePrice,
      psaDrafting: deals.psaDrafting,
      notes: deals.notes,
      createdAt: deals.createdAt,
      // Correlated counts of everything the FK cascade is about to take
      // with the deal. Same round-trip so the count is what the delete
      // actually removed, and it answers "how big was this delete" after
      // the rows are gone.
      checklistItemCount: sql<number>`(
        SELECT count(*)::int FROM ${checklistItems} ci
        INNER JOIN ${checklistCategories} cc ON cc.id = ci.category_id
        WHERE cc.deal_id = ${deals.id}
      )`,
      dealBuyerCount: sql<number>`(
        SELECT count(*)::int FROM ${dealBuyers} db_ WHERE db_.deal_id = ${deals.id}
      )`,
      dealContactCount: sql<number>`(
        SELECT count(*)::int FROM ${dealContacts} dc WHERE dc.deal_id = ${deals.id}
      )`,
      qaItemCount: sql<number>`(
        SELECT count(*)::int FROM ${qaItems} q WHERE q.deal_id = ${deals.id}
      )`,
      issueCount: sql<number>`(
        SELECT count(*)::int FROM ${issues} i WHERE i.deal_id = ${deals.id}
      )`,
      consultantCount: sql<number>`(
        SELECT count(*)::int FROM ${consultants} c WHERE c.deal_id = ${deals.id}
      )`,
      documentCount: sql<number>`(
        SELECT count(*)::int FROM ${documents} d WHERE d.deal_id = ${deals.id}
      )`,
      dealTeamMemberCount: sql<number>`(
        SELECT count(*)::int FROM ${dealTeamMembers} dtm WHERE dtm.deal_id = ${deals.id}
      )`,
    })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)))
    .limit(1);
  if (!preflight || !preflight.archivedAt) {
    // Same message regardless of "not found" vs "not archived" so the
    // response doesn't leak existence across tenants.
    throw new Error("Deal must be archived before it can be deleted");
  }

  // Best-effort blob cleanup BEFORE the DB cascade removes the pointer
  // rows. Postgres cascades documents/consultants/etc. via the FKs but
  // Vercel Blob has no such cascade — orphaned files would leak forever.
  // Use allSettled + swallow errors: if a delete fails, the blob is
  // orphaned but the DB delete still runs (matches src/lib/documents.ts
  // pattern of swallow-and-log so DB truth doesn't diverge from blob).
  const docBlobRows = await db
    .select({ r2Key: documents.r2Key })
    .from(documents)
    .where(and(eq(documents.dealId, dealId), isNotNull(documents.r2Key)));
  const blobKeys = docBlobRows
    .map((r) => r.r2Key)
    .filter((k): k is string => Boolean(k));
  if (preflight.bannerImagePath) blobKeys.push(preflight.bannerImagePath);
  if (blobKeys.length > 0) {
    const outcomes = await Promise.allSettled(blobKeys.map((k) => del(k)));
    for (const [i, o] of outcomes.entries()) {
      if (o.status === "rejected") {
        console.warn(
          `[deleteDeal] blob delete failed for ${blobKeys[i]}:`,
          o.reason,
        );
      }
    }
  }

  // DB cascade wipes checklist/contacts/Q&A/issues/consultants/documents/etc.
  await db
    .delete(deals)
    .where(
      and(
        eq(deals.id, dealId),
        eq(deals.orgId, org.id),
        isNotNull(deals.archivedAt),
      ),
    );

  // Written before the redirect below, which throws internally and would
  // skip anything placed after it.
  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "deal.deleted",
    entityType: "deal",
    entityId: dealId,
    // Every deal column lands here, because nothing else survives. The
    // uncapped text columns go through the truncator on the way in.
    before: {
      name: truncateForAudit(preflight.name),
      units: preflight.units,
      city: truncateForAudit(preflight.city),
      state: truncateForAudit(preflight.state),
      type: truncateForAudit(preflight.type),
      priority: preflight.priority,
      purchasePrice: preflight.purchasePrice,
      psaDrafting: preflight.psaDrafting,
      bannerImagePath: preflight.bannerImagePath,
      notes: truncateForAudit(preflight.notes),
      archivedAt: preflight.archivedAt,
      createdAt: preflight.createdAt,
    },
    metadata: {
      dealId,
      dealName: truncateForAudit(preflight.name),
      label: truncateForAudit(preflight.name),
      // How many blobs the best-effort cleanup above tried to remove. First
      // thing to check if files turn up orphaned in storage later.
      blobKeyCount: blobKeys.length,
      // What the FK cascade took with the deal. Counts only: enumerating
      // every child row of a deal would dwarf the entry, and each of those
      // tables has its own entries earlier in the log.
      cascaded: {
        checklistItems: preflight.checklistItemCount,
        dealBuyers: preflight.dealBuyerCount,
        dealContacts: preflight.dealContactCount,
        qaItems: preflight.qaItemCount,
        issues: preflight.issueCount,
        consultants: preflight.consultantCount,
        documents: preflight.documentCount,
        dealTeamMembers: preflight.dealTeamMemberCount,
      },
    },
  });

  // Layout-scope revalidate so PriorityRibbon + Sidebar drop the deleted
  // deal on the next render (and the archived-count in the collapsible
  // section decrements).
  revalidatePath("/", "layout");
  redirect("/");
}
