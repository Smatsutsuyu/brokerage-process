"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { del } from "@vercel/blob";

import { db } from "@/db";
import { seedChecklistForDeal } from "@/db/seed-checklist";
import { deals, documents } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

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

  await db
    .update(deals)
    .set({
      name,
      units: input.units ?? null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      type: input.type?.trim() || null,
      priority: input.priority,
      purchasePrice:
        input.purchasePrice != null ? input.purchasePrice.toFixed(2) : null,
      notes: input.notes?.trim() || null,
    })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

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

  await db
    .update(deals)
    .set({ archivedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  revalidatePath(`/deals/${dealId}`);
  // Revalidate the (app) layout so PriorityRibbon (rendered in the layout,
  // not any single page) re-queries and drops the newly-archived deal.
  revalidatePath("/", "layout");
}

export async function unarchiveDeal(dealId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(deals)
    .set({ archivedAt: null })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

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

  // Preflight: only proceed if the deal exists in this org AND is archived.
  // We fetch the archive gate here (before wiping blobs) so a caller
  // trying to delete an active or foreign deal doesn't get partial cleanup.
  const [preflight] = await db
    .select({
      id: deals.id,
      archivedAt: deals.archivedAt,
      bannerImagePath: deals.bannerImagePath,
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

  // Layout-scope revalidate so PriorityRibbon + Sidebar drop the deleted
  // deal on the next render (and the archived-count in the collapsible
  // section decrements).
  revalidatePath("/", "layout");
  redirect("/");
}
