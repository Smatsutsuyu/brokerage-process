"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealBuyers, dealContacts, deals } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { findBuilderByName } from "@/lib/builders";

export type Classification = "private" | "public" | "developer";

export type BuilderInput = {
  name: string;
  classification: Classification;
  notes?: string;
};

// Builders show up in two places: /builders (this directory) and the deal
// Contacts tab (via the buyer rows + contact picker). Any mutation needs
// both invalidated.
function revalidateBuilderSurfaces() {
  revalidatePath("/builders");
  revalidatePath("/contacts");
  revalidatePath("/deals/[id]", "page");
}

export type CreateBuilderResult =
  | { ok: true; builderId: string }
  | { ok: false; error: string };

// Returns a Result object instead of throwing for expected validation
// failures (empty name, duplicate name). Next.js strips Server Action
// throw messages in production, so a thrown Error reaches the client as
// the generic "Server Components render" message — useless for surfacing
// a name-conflict to the user. Unexpected failures (DB down, etc.) still
// throw and trigger the framework's generic error handler.
export async function createBuilder(input: BuilderInput): Promise<CreateBuilderResult> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Builder name is required." };

  // Block create when a builder by this name already exists in the org
  // (case-insensitive, whitespace-tolerant). The /builders form is an
  // explicit "add new" action — silently linking to an existing record
  // would be confusing, so we surface a clear message and let the user
  // either rename or cancel.
  const existing = await findBuilderByName(db, org.id, name);
  if (existing) {
    return { ok: false, error: `A builder named "${existing.name}" already exists in this org.` };
  }

  const [created] = await db
    .insert(builders)
    .values({
      orgId: org.id,
      name,
      classification: input.classification,
      notes: input.notes?.trim() || null,
    })
    .returning();

  revalidateBuilderSurfaces();
  return { ok: true, builderId: created.id };
}

export async function updateBuilder(input: {
  builderId: string;
  data: BuilderInput;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.data.name.trim();
  if (!name) throw new Error("Builder name is required");

  await db
    .update(builders)
    .set({
      name,
      classification: input.data.classification,
      notes: input.data.notes?.trim() || null,
    })
    .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)));

  revalidateBuilderSurfaces();
}

export async function deleteBuilder(builderId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // A builder is visibly "on a deal" when at least one of its contacts is
  // attached to that deal via deal_contacts. We block deletion in that
  // case so the user sees the impact rather than silently destroying it.
  //
  // The deal_buyers row can also exist with zero attached contacts (the
  // builder card disappears from the cards UI but the row sticks around
  // to retain tier/lead/etc. if a contact is re-added). Those orphan
  // rows are hidden from the user and would block deletion with no
  // visible cause — we sweep them in the same transaction as the
  // builder delete.
  const buyerRows = await db
    .select({
      dealBuyerId: dealBuyers.id,
      dealId: dealBuyers.dealId,
      dealName: deals.name,
      contactCount: sql<number>`(
        SELECT count(*)::int FROM ${dealContacts} dc
        INNER JOIN ${contacts} c ON c.id = dc.contact_id
        WHERE dc.deal_id = ${dealBuyers.dealId}
          AND c.builder_id = ${dealBuyers.builderId}
      )`,
    })
    .from(dealBuyers)
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(and(eq(dealBuyers.builderId, builderId), eq(dealBuyers.orgId, org.id)));

  const dealsWithContacts = buyerRows.filter((r) => Number(r.contactCount) > 0);
  if (dealsWithContacts.length > 0) {
    const names = dealsWithContacts.map((r) => r.dealName).join(", ");
    throw new Error(
      `Builder is on ${dealsWithContacts.length} deal${
        dealsWithContacts.length === 1 ? "" : "s"
      } with attached contacts: ${names}. Remove from those deals before deleting.`,
    );
  }

  // No visible attachments. Sweep any orphan deal_buyers rows (zero
  // contacts on that deal) before dropping the builder so the FK doesn't
  // complain.
  const orphanIds = buyerRows.map((r) => r.dealBuyerId);
  await db.transaction(async (tx) => {
    if (orphanIds.length > 0) {
      await tx.delete(dealBuyers).where(inArray(dealBuyers.id, orphanIds));
    }
    await tx
      .delete(builders)
      .where(and(eq(builders.id, builderId), eq(builders.orgId, org.id)));
  });

  revalidateBuilderSurfaces();
}
