"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { seedChecklistForDeal } from "@/db/seed-checklist";
import { deals } from "@/db/schema";
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

export async function deleteDeal(dealId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db.delete(deals).where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  revalidatePath("/");
  redirect("/");
}
