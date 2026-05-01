"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { checklistCategories, checklistItems, dealBuyers } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

export async function toggleChecklistItem(input: {
  itemId: string;
  dealId: string;
  completed: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Scope the update to the current org so a forged itemId can't reach across tenants.
  // Once Clerk provides a real user, completedBy will be set from auth().
  await db
    .update(checklistItems)
    .set({
      completed: input.completed,
      completedAt: input.completed ? new Date() : null,
      completedBy: null,
    })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function updateBuyerTier(input: {
  dealBuyerId: string;
  dealId: string;
  tier: "green" | "yellow" | "red" | "not_selected";
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ tier: input.tier })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerCalled(input: {
  dealBuyerId: string;
  dealId: string;
  called: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ calledAt: input.called ? new Date() : null })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerOmSent(input: {
  dealBuyerId: string;
  dealId: string;
  omSent: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ omSentAt: input.omSent ? new Date() : null })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// Verifies that an item belongs to the active deal — useful for any action
// that takes an itemId from the client. Lightweight no-op if the join holds.
export async function assertItemOnDeal(itemId: string, dealId: string) {
  const [row] = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(and(eq(checklistItems.id, itemId), eq(checklistCategories.dealId, dealId)))
    .limit(1);
  if (!row) throw new Error("Item not on deal");
}
