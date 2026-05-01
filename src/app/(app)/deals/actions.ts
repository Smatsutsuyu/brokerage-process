"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

export type DealStatus = "phase_1" | "phase_2" | "phase_3" | "phase_4" | "closed" | "cancelled";
export type DealPriority = "low" | "medium" | "high";

export type DealInput = {
  name: string;
  units?: number | null;
  city?: string;
  state?: string;
  type?: string;
  status: DealStatus;
  priority: DealPriority;
  notes?: string;
};

export async function createDeal(input: DealInput): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Deal name is required");

  const [created] = await db
    .insert(deals)
    .values({
      orgId: org.id,
      name,
      units: input.units ?? null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      type: input.type?.trim() || null,
      status: input.status,
      priority: input.priority,
      notes: input.notes?.trim() || null,
    })
    .returning();

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
      status: input.status,
      priority: input.priority,
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
