"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  builders,
  checklistCategories,
  checklistItems,
  consultants,
  contacts,
  dealBuyers,
  deals,
  issues,
  qaItems,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { formatPhone } from "@/lib/phone";

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

// Attach an external link (Dropbox folder, SharePoint, Google Drive, any
// URL) to a checklist item. Stored on the item itself (not as a document
// row) since the platform never sees the file — it's just a pointer for
// users. Optional label so a long share URL can display as something
// readable like "HOA Budget folder."
export async function setChecklistItemLink(input: {
  itemId: string;
  dealId: string;
  url: string;
  label?: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const url = input.url.trim();
  if (!url) throw new Error("URL is required");
  // Light validation — accept anything that parses as a URL with a scheme.
  // We don't restrict to specific hosts; users may legitimately link to
  // SharePoint, Drive, internal file shares, etc.
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("URL must start with http(s)://");
    }
  } catch {
    throw new Error("Not a valid URL");
  }

  await db
    .update(checklistItems)
    .set({
      externalLinkUrl: url,
      externalLinkLabel: input.label?.trim() || null,
    })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function clearChecklistItemLink(input: {
  itemId: string;
  dealId: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(checklistItems)
    .set({ externalLinkUrl: null, externalLinkLabel: null })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// Free-form working notes per checklist item. Empty string clears the
// notes field — keeps the API simple (one action handles both save + clear)
// vs needing a separate clear action.
export async function setChecklistItemNotes(input: {
  itemId: string;
  dealId: string;
  notes: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const trimmed = input.notes.trim();
  await db
    .update(checklistItems)
    .set({ notes: trimmed || null })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// PSA Attorney decision recorded on the deal itself (not a consultant
// row). Surfaced inline on the "Determine PSA Attorney" checklist row.
// All three fields nullable individually so a partial decision (firm
// known, name TBD, drafting undecided) is representable.
export type PsaDrafting = "buyer" | "seller" | "na";

export async function setPsaAttorney(input: {
  dealId: string;
  name: string | null;
  firm: string | null;
  drafting: PsaDrafting | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(deals)
    .set({
      psaAttorneyName: input.name?.trim() || null,
      psaAttorneyFirm: input.firm?.trim() || null,
      psaDrafting: input.drafting,
    })
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)));

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

export async function setBuyerLead(input: {
  dealBuyerId: string;
  dealId: string;
  leadUserId: string | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ leadUserId: input.leadUserId })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export type AddContactInput = {
  dealId: string;
  // Either builderId (existing builder, must already be on this deal) or
  // newBuilderName (will be created + added to the deal). Exactly one of
  // the two must be provided.
  builderId?: string;
  newBuilderName?: string;
  // Only relevant when newBuilderName is set. Defaults to "private" if
  // omitted — most "I just learned about this builder" cases are private.
  newBuilderClassification?: "private" | "public";
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

  if (!input.builderId && !input.newBuilderName?.trim()) {
    throw new Error("Builder is required");
  }
  if (input.builderId && input.newBuilderName?.trim()) {
    throw new Error("Provide either builderId or newBuilderName, not both");
  }

  let builderId = input.builderId;

  // Caller wants a brand-new builder created + attached to this deal in one
  // shot. Defaults: classification = private (most common case for the kind
  // of unknown-to-the-org builder you'd hand-add via the contact form), tier
  // = not_selected (Chris explicitly tiers them later in the workflow).
  if (input.newBuilderName?.trim()) {
    const name = input.newBuilderName.trim();
    const [builder] = await db
      .insert(builders)
      .values({
        orgId: org.id,
        name,
        classification: input.newBuilderClassification ?? "private",
      })
      .returning();
    await db.insert(dealBuyers).values({
      orgId: org.id,
      dealId: input.dealId,
      builderId: builder.id,
      tier: "not_selected",
    });
    builderId = builder.id;
  } else {
    // Existing builder must belong to this org AND be on this deal — both
    // checks needed to prevent forging a cross-tenant or wrong-deal id.
    const [link] = await db
      .select({ id: dealBuyers.id })
      .from(dealBuyers)
      .innerJoin(builders, eq(dealBuyers.builderId, builders.id))
      .where(
        and(
          eq(dealBuyers.dealId, input.dealId),
          eq(dealBuyers.builderId, input.builderId!),
          eq(builders.orgId, org.id),
        ),
      )
      .limit(1);
    if (!link) throw new Error("Builder is not a buyer on this deal");
  }

  await db.insert(contacts).values({
    orgId: org.id,
    builderId: builderId!,
    firstName,
    lastName,
    title: input.title?.trim() || null,
    email: input.email?.trim() || null,
    phone: formatPhone(input.phone),
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
      phone: formatPhone(input.phone),
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

export type ConsultantRole =
  | "landscape_architect"
  | "civil_engineer"
  | "soils_engineer"
  | "cost_to_complete"
  | "hoa"
  | "dry_utility"
  | "phase_1_environmental"
  | "land_use"
  | "biologist"
  | "architect"
  | "psa_attorney";

export type ConsultantSide = "buyer" | "seller";

export async function addConsultant(input: {
  dealId: string;
  role: ConsultantRole;
  side: ConsultantSide;
  firmName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firmName = input.firmName.trim();
  if (!firmName) throw new Error("Firm name is required");

  await db.insert(consultants).values({
    orgId: org.id,
    dealId: input.dealId,
    role: input.role,
    side: input.side,
    firmName,
    contactName: input.contactName?.trim() || null,
    contactEmail: input.contactEmail?.trim() || null,
    contactPhone: formatPhone(input.contactPhone),
    notes: input.notes?.trim() || null,
  });

  revalidatePath(`/deals/${input.dealId}`);
}

export async function updateConsultant(input: {
  dealId: string;
  consultantId: string;
  role: ConsultantRole;
  side: ConsultantSide;
  firmName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firmName = input.firmName.trim();
  if (!firmName) throw new Error("Firm name is required");

  await db
    .update(consultants)
    .set({
      role: input.role,
      side: input.side,
      firmName,
      contactName: input.contactName?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: formatPhone(input.contactPhone),
      notes: input.notes?.trim() || null,
    })
    .where(and(eq(consultants.id, input.consultantId), eq(consultants.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteConsultant(input: { dealId: string; consultantId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(consultants)
    .where(and(eq(consultants.id, input.consultantId), eq(consultants.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function addBuilderToDeal(input: {
  dealId: string;
  name: string;
  classification: "private" | "public";
  tier?: "green" | "yellow" | "red" | "not_selected";
  notes?: string;
}): Promise<{ builderId: string; dealBuyerId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const name = input.name.trim();
  if (!name) throw new Error("Builder name is required");

  // Single transaction so we don't end up with an orphan builder if the
  // deal_buyer insert fails.
  const result = await db.transaction(async (tx) => {
    const [builder] = await tx
      .insert(builders)
      .values({
        orgId: org.id,
        name,
        classification: input.classification,
        notes: input.notes?.trim() || null,
      })
      .returning();

    const [dealBuyer] = await tx
      .insert(dealBuyers)
      .values({
        orgId: org.id,
        dealId: input.dealId,
        builderId: builder.id,
        tier: input.tier ?? "not_selected",
      })
      .returning();

    return { builderId: builder.id, dealBuyerId: dealBuyer.id };
  });

  revalidatePath(`/deals/${input.dealId}`);
  return result;
}

// Attaches an existing org builder to a deal. Idempotent — if the builder
// is already on the deal, returns the existing dealBuyer id without
// inserting a duplicate. Used by the "Add Existing Contact" flow when the
// picked contact's builder isn't yet on the deal — we just bring the
// builder along automatically rather than asking the user to pick.
export async function attachBuilderToDeal(input: {
  dealId: string;
  builderId: string;
}): Promise<{ dealBuyerId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Confirm builder belongs to this org.
  const [b] = await db
    .select({ id: builders.id })
    .from(builders)
    .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)))
    .limit(1);
  if (!b) throw new Error("Builder not found");

  // Already on the deal? Return the existing row.
  const [existing] = await db
    .select({ id: dealBuyers.id })
    .from(dealBuyers)
    .where(
      and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.builderId, input.builderId)),
    )
    .limit(1);
  if (existing) {
    return { dealBuyerId: existing.id };
  }

  const [created] = await db
    .insert(dealBuyers)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      builderId: input.builderId,
      tier: "not_selected",
    })
    .returning();

  revalidatePath(`/deals/${input.dealId}`);
  return { dealBuyerId: created.id };
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
