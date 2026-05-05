"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { builders, dealBuyers } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

export type Classification = "private" | "public";

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

export async function createBuilder(input: BuilderInput): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Builder name is required");

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
  return created.id;
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

  // Block deletion if the builder is on any deal — explicit choice (option A
  // from the design discussion). Forces the user to remove from each deal
  // first, which surfaces the impact rather than silently destroying buyer
  // history. Contacts at this builder will orphan (FK is set null), which
  // is fine — the human record stays even if the company affiliation goes.
  const [onDeal] = await db
    .select({ id: dealBuyers.id })
    .from(dealBuyers)
    .where(and(eq(dealBuyers.builderId, builderId), eq(dealBuyers.orgId, org.id)))
    .limit(1);
  if (onDeal) {
    throw new Error(
      "Builder is on one or more deals. Remove from those deals before deleting.",
    );
  }

  await db
    .delete(builders)
    .where(and(eq(builders.id, builderId), eq(builders.orgId, org.id)));

  revalidateBuilderSurfaces();
}
