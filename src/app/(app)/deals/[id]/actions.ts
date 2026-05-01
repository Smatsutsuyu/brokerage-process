"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  builders,
  checklistCategories,
  checklistItems,
  contacts,
  dealBuyers,
  issues,
  qaItems,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

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

export type AddContactInput = {
  dealId: string;
  builderId: string;
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

export async function addContact(input: AddContactInput) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");

  // Confirm the builder belongs to this org and is a buyer on this deal —
  // prevents adding a contact for a builder that isn't actually on this deal.
  const [link] = await db
    .select({ id: dealBuyers.id })
    .from(dealBuyers)
    .innerJoin(builders, eq(dealBuyers.builderId, builders.id))
    .where(
      and(
        eq(dealBuyers.dealId, input.dealId),
        eq(dealBuyers.builderId, input.builderId),
        eq(builders.orgId, org.id),
      ),
    )
    .limit(1);
  if (!link) throw new Error("Builder is not a buyer on this deal");

  await db.insert(contacts).values({
    orgId: org.id,
    builderId: input.builderId,
    firstName,
    lastName,
    title: input.title?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
  });

  revalidatePath(`/deals/${input.dealId}`);
}

export async function updateContact(input: {
  dealId: string;
  contactId: string;
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");

  await db
    .update(contacts)
    .set({
      firstName,
      lastName,
      title: input.title?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteContact(input: { dealId: string; contactId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function addQaItem(input: { dealId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const [created] = await db
    .insert(qaItems)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      question: "",
      answer: "",
    })
    .returning();

  revalidatePath(`/deals/${input.dealId}`);
  return created.id;
}

export async function updateQaItem(input: {
  dealId: string;
  qaId: string;
  question: string;
  answer: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(qaItems)
    .set({ question: input.question, answer: input.answer })
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setQaApproved(input: {
  dealId: string;
  qaId: string;
  approved: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();

  await db
    .update(qaItems)
    .set({
      approved: input.approved,
      approvedAt: input.approved ? new Date() : null,
      approvedBy: input.approved ? (user?.id ?? null) : null,
    })
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteQaItem(input: { dealId: string; qaId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(qaItems)
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export async function addIssue(input: {
  dealId: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignedUserId?: string | null;
  identifiedAt?: Date | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const title = input.title.trim();
  if (!title) throw new Error("Issue title is required");

  await db.insert(issues).values({
    orgId: org.id,
    dealId: input.dealId,
    title,
    description: input.description?.trim() || null,
    status: input.status,
    priority: input.priority,
    assignedUserId: input.assignedUserId ?? null,
    identifiedAt: input.identifiedAt ?? new Date(),
  });

  revalidatePath(`/deals/${input.dealId}`);
}

export async function updateIssue(input: {
  dealId: string;
  issueId: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignedUserId?: string | null;
  identifiedAt?: Date | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const title = input.title.trim();
  if (!title) throw new Error("Issue title is required");

  const wasResolved = input.status === "resolved";

  await db
    .update(issues)
    .set({
      title,
      description: input.description?.trim() || null,
      status: input.status,
      priority: input.priority,
      assignedUserId: input.assignedUserId ?? null,
      identifiedAt: input.identifiedAt ?? undefined,
      resolvedAt: wasResolved ? new Date() : null,
    })
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setIssueStatus(input: {
  dealId: string;
  issueId: string;
  status: IssueStatus;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(issues)
    .set({
      status: input.status,
      resolvedAt: input.status === "resolved" ? new Date() : null,
    })
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteIssue(input: { dealId: string; issueId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(issues)
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function approveAllQaItems(input: { dealId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();

  await db
    .update(qaItems)
    .set({
      approved: true,
      approvedAt: new Date(),
      approvedBy: user?.id ?? null,
    })
    .where(
      and(
        eq(qaItems.dealId, input.dealId),
        eq(qaItems.orgId, org.id),
        eq(qaItems.approved, false),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

export async function addBuilderToDeal(input: {
  dealId: string;
  name: string;
  classification: "private" | "public";
  tier?: "green" | "yellow" | "red" | "not_selected";
  notes?: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Builder name is required");

  // Single transaction so we don't end up with an orphan builder if the
  // deal_buyer insert fails.
  await db.transaction(async (tx) => {
    const [builder] = await tx
      .insert(builders)
      .values({
        orgId: org.id,
        name,
        classification: input.classification,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await tx.insert(dealBuyers).values({
      orgId: org.id,
      dealId: input.dealId,
      builderId: builder.id,
      tier: input.tier ?? "not_selected",
    });
  });

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
