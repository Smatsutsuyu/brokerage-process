"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  checklistCategories,
  checklistItemLinks,
  checklistItems,
  consultants,
  contacts,
  dealBuyers,
  dealContacts,
  dealTeamMembers,
  deals,
  documents,
  issues,
  qaItems,
  users,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { findBuilderByName } from "@/lib/builders";
import { sendResolvedEmails, type BlastSendResult } from "@/lib/email/blast";
import { env } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import type { ResolvedEmail } from "@/components/email/email-preview-modal";

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

// External-link attachments per checklist item. Stored as their own rows
// (checklist_item_links) so a single item can carry many references —
// Dropbox folder + Drive backup + SharePoint mirror, etc. Each link has a
// URL + optional human label that beats showing a long share URL raw.
//
// Light URL validation — accept anything that parses as a URL with an
// http(s) scheme. We don't restrict by host; users link to SharePoint,
// Drive, internal file shares, anything.
function validateLinkUrl(raw: string): string {
  const url = raw.trim();
  if (!url) throw new Error("URL is required");
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("URL must start with http(s)://");
    }
  } catch {
    throw new Error("Not a valid URL");
  }
  return url;
}

export async function addChecklistItemLink(input: {
  itemId: string;
  dealId: string;
  url: string;
  label?: string;
}): Promise<{ linkId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const url = validateLinkUrl(input.url);

  // Verify the parent item belongs to this org before creating the link.
  const [item] = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)))
    .limit(1);
  if (!item) throw new Error("Checklist item not found");

  const [created] = await db
    .insert(checklistItemLinks)
    .values({
      orgId: org.id,
      checklistItemId: input.itemId,
      url,
      label: input.label?.trim() || null,
    })
    .returning();

  revalidatePath(`/deals/${input.dealId}`);
  return { linkId: created.id };
}

export async function updateChecklistItemLink(input: {
  linkId: string;
  dealId: string;
  url: string;
  label?: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const url = validateLinkUrl(input.url);

  await db
    .update(checklistItemLinks)
    .set({ url, label: input.label?.trim() || null })
    .where(
      and(eq(checklistItemLinks.id, input.linkId), eq(checklistItemLinks.orgId, org.id)),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteChecklistItemLink(input: {
  linkId: string;
  dealId: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(checklistItemLinks)
    .where(
      and(eq(checklistItemLinks.id, input.linkId), eq(checklistItemLinks.orgId, org.id)),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Milestone date attached to a checklist item (only meaningful for items
// the template flags with `dateField: true`). Date stored as YYYY-MM-DD.
// Pass null to clear. The UI defaults the picker to today's local-time
// date on first set, since users typically record these on the day the
// milestone happens.
export async function setChecklistItemDate(input: {
  itemId: string;
  dealId: string;
  date: string | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Light validation: must be empty string / null / a YYYY-MM-DD form.
  // Drizzle's date column accepts a string in that shape; anything else
  // would error noisily, so we fail early with a clearer message.
  if (input.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }

  await db
    .update(checklistItems)
    .set({ trackedDate: input.date })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// Free-form working notes per checklist item. Empty string clears the
// notes field. Keeps the API simple (one action handles both save and
// clear) vs needing a separate clear action.
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

// Mirror of setBuyerOmSent for the Phase 2 Share Marketing Due Diligence
// Folder send. Auto-flipped by the DD blast composer (markBuildersSent
// with field "dd") and surfaced as a "DD" checkbox on the buyer card.
export async function setBuyerDdSent(input: {
  dealBuyerId: string;
  dealId: string;
  ddSent: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ ddSentAt: input.ddSent ? new Date() : null })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerConfiSigned(input: {
  dealBuyerId: string;
  dealId: string;
  confiSigned: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ confiSignedAt: input.confiSigned ? new Date() : null })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerOfferReceived(input: {
  dealBuyerId: string;
  dealId: string;
  offerReceived: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealBuyers)
    .set({ offerReceivedAt: input.offerReceived ? new Date() : null })
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

// Per-builder CC list — users CC'd on every email blast to this builder.
// Caller sends the full new list each time (idempotent set semantics);
// no diffing/add/remove actions needed. Scoped by (dealId, builderId)
// so the caller doesn't have to track dealBuyerId — same identity
// underneath.
export async function setBuilderCcUsers(input: {
  dealId: string;
  builderId: string;
  userIds: string[];
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Dedupe defensively — array column has no unique constraint, and the
  // UI's checkbox toggling shouldn't be able to send dupes anyway, but
  // belt-and-suspenders.
  const deduped = Array.from(new Set(input.userIds));

  await db
    .update(dealBuyers)
    .set({ ccUserIds: deduped })
    .where(
      and(
        eq(dealBuyers.dealId, input.dealId),
        eq(dealBuyers.builderId, input.builderId),
        eq(dealBuyers.orgId, org.id),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Free-text comments on a builder's interest in this deal. Surfaces in the
// Marketing Report PDF as the right-hand "Comments" column. Empty string
// clears the field (stored as null).
export async function setBuyerComments(input: {
  dealBuyerId: string;
  dealId: string;
  comments: string;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const trimmed = input.comments.trim();
  await db
    .update(dealBuyers)
    .set({ comments: trimmed || null })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

export type AddContactInput = {
  dealId: string;
  // Builder is OPTIONAL under the deal_contacts model. Provide builderId
  // (must already be on this deal) OR newBuilderName (will be created +
  // attached) OR neither (contact lands in the Unaffiliated card).
  builderId?: string;
  newBuilderName?: string;
  // Only relevant when newBuilderName is set.
  newBuilderClassification?: "private" | "public" | "developer";
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
  // Marketing-blast opt-in. Optional — defaults to true at the schema
  // level so callers that don't surface the field still create
  // communicate-able contacts.
  receivesCommunication?: boolean;
};

export async function addContact(input: AddContactInput) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");

  if (input.builderId && input.newBuilderName?.trim()) {
    throw new Error("Provide either builderId or newBuilderName, not both");
  }

  await db.transaction(async (tx) => {
    let builderId: string | null = input.builderId ?? null;

    // Caller wants a brand-new builder created + attached to this deal.
    // If a builder by this name already exists in the org, reuse it —
    // the user typed a duplicate name from a stale memory of the picker,
    // not because they actually wanted a new row. Then attach to deal
    // idempotently (the dupe builder may already be on this deal).
    if (input.newBuilderName?.trim()) {
      const name = input.newBuilderName.trim();
      const existing = await findBuilderByName(tx, org.id, name);
      let resolvedBuilderId: string;
      if (existing) {
        resolvedBuilderId = existing.id;
      } else {
        const [builder] = await tx
          .insert(builders)
          .values({
            orgId: org.id,
            name,
            classification: input.newBuilderClassification ?? "private",
          })
          .returning();
        resolvedBuilderId = builder.id;
      }
      const [existingLink] = await tx
        .select({ id: dealBuyers.id })
        .from(dealBuyers)
        .where(
          and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.builderId, resolvedBuilderId)),
        )
        .limit(1);
      if (!existingLink) {
        await tx.insert(dealBuyers).values({
          orgId: org.id,
          dealId: input.dealId,
          builderId: resolvedBuilderId,
          tier: "not_selected",
        });
      }
      builderId = resolvedBuilderId;
    } else if (builderId) {
      // Existing builder must belong to this org. We no longer require it
      // to be already on the deal — if it isn't, attach it now (idempotent
      // via the existing-link check) so the contact has a builder card to
      // appear under.
      const [b] = await tx
        .select({ id: builders.id })
        .from(builders)
        .where(and(eq(builders.id, builderId), eq(builders.orgId, org.id)))
        .limit(1);
      if (!b) throw new Error("Builder not found");

      const [existingLink] = await tx
        .select({ id: dealBuyers.id })
        .from(dealBuyers)
        .where(
          and(
            eq(dealBuyers.dealId, input.dealId),
            eq(dealBuyers.builderId, builderId),
          ),
        )
        .limit(1);
      if (!existingLink) {
        await tx.insert(dealBuyers).values({
          orgId: org.id,
          dealId: input.dealId,
          builderId,
          tier: "not_selected",
        });
      }
    }
    // builderId may still be null here — that's intentional, contact lands
    // in the Unaffiliated card.

    const [created] = await tx
      .insert(contacts)
      .values({
        orgId: org.id,
        builderId,
        firstName,
        lastName,
        title: input.title?.trim() || null,
        email: input.email?.trim() || null,
        phone: formatPhone(input.phone),
        notes: input.notes?.trim() || null,
        // Default to true via the schema; explicit when caller provides.
        ...(input.receivesCommunication !== undefined
          ? { receivesCommunication: input.receivesCommunication }
          : {}),
      })
      .returning();

    // Explicit assignment to the deal — required under the new model for
    // the contact to show up.
    await tx.insert(dealContacts).values({
      orgId: org.id,
      dealId: input.dealId,
      contactId: created.id,
    });
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
  // Optional — when undefined we leave the existing value alone (so callers
  // that don't surface the field can ignore it). When provided, sets the
  // marketing-blast opt-in flag.
  receivesCommunication?: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");

  const update: {
    firstName: string;
    lastName: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    receivesCommunication?: boolean;
  } = {
    firstName,
    lastName,
    title: input.title?.trim() || null,
    email: input.email?.trim() || null,
    phone: formatPhone(input.phone),
    notes: input.notes?.trim() || null,
  };
  if (input.receivesCommunication !== undefined) {
    update.receivesCommunication = input.receivesCommunication;
  }

  await db
    .update(contacts)
    .set(update)
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
  | "psa_attorney"
  | "title"
  | "escrow";

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
  classification: "private" | "public" | "developer";
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
    // Find-or-create on the builder so we don't double-insert a builder
    // that already exists in the org under the same (normalized) name.
    // Then attach to the deal idempotently — the reused builder might
    // already be on this deal.
    const existing = await findBuilderByName(tx, org.id, name);
    let builderId: string;
    if (existing) {
      builderId = existing.id;
    } else {
      const [builder] = await tx
        .insert(builders)
        .values({
          orgId: org.id,
          name,
          classification: input.classification,
          notes: input.notes?.trim() || null,
        })
        .returning();
      builderId = builder.id;
    }

    const [existingLink] = await tx
      .select({ id: dealBuyers.id })
      .from(dealBuyers)
      .where(and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.builderId, builderId)))
      .limit(1);
    let dealBuyerId: string;
    if (existingLink) {
      dealBuyerId = existingLink.id;
    } else {
      const [dealBuyer] = await tx
        .insert(dealBuyers)
        .values({
          orgId: org.id,
          dealId: input.dealId,
          builderId,
          tier: input.tier ?? "not_selected",
        })
        .returning();
      dealBuyerId = dealBuyer.id;
    }

    return { builderId, dealBuyerId };
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

// Bulk-add the "Add Existing Contact" flow. Replaces N round-trips of
// attachBuilderToDeal + updateContact with a single transaction. Per Chris's
// feedback (2026-05-12): adding 30 contacts one modal at a time was painful.
//
// Each selected contact is one of two shapes:
// - has-builder    → just attach their builder to the deal (idempotent)
// - standalone     → re-point them at standaloneTarget AND attach that
//                    builder to the deal (idempotent). Required when any
//                    selected contact is standalone.
//
// Whole thing is wrapped in a transaction so a partial failure doesn't
// leave the deal half-updated.
export type BulkStandaloneTarget =
  | { type: "existing"; builderId: string }
  | {
      type: "new";
      name: string;
      classification: "private" | "public" | "developer";
    };

export async function bulkAddContactsToDeal(input: {
  dealId: string;
  contactIds: string[];
  standaloneTarget?: BulkStandaloneTarget;
}): Promise<{
  added: number;
  buildersAttached: number;
  buildersCreated: number;
  contactsRepointed: number;
}> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  if (input.contactIds.length === 0) throw new Error("No contacts selected");

  // Look up every selected contact in one query (org-scoped — prevents a
  // forged id from another tenant slipping in).
  const rows = await db
    .select({ id: contacts.id, builderId: contacts.builderId })
    .from(contacts)
    .where(and(inArray(contacts.id, input.contactIds), eq(contacts.orgId, org.id)));
  if (rows.length !== input.contactIds.length) {
    throw new Error("One or more contacts not found");
  }

  const standalones = rows.filter((r) => !r.builderId);
  const withBuilder = rows.filter((r) => r.builderId);

  // standaloneTarget is OPTIONAL under the new model — picking one re-points
  // the standalone contacts to that builder (and attaches it to the deal so
  // the card shows up). Skipping it leaves them as standalones; they show
  // up in the "Unaffiliated" card on the deal.
  if (input.standaloneTarget?.type === "new") {
    if (!input.standaloneTarget.name.trim()) {
      throw new Error("New builder name is required");
    }
  }

  let buildersCreated = 0;
  let buildersAttached = 0;
  let contactsRepointed = 0;
  let dealContactsAdded = 0;

  await db.transaction(async (tx) => {
    // Step 1: resolve the standalone target builder (creating it if needed)
    // and ensure it's attached to the deal. Skipped entirely when no target
    // was picked — standalones stay standalone.
    let standaloneBuilderId: string | null = null;
    if (input.standaloneTarget) {
      if (input.standaloneTarget.type === "new") {
        const name = input.standaloneTarget.name.trim();
        const existing = await findBuilderByName(tx, org.id, name);
        if (existing) {
          standaloneBuilderId = existing.id;
        } else {
          const [b] = await tx
            .insert(builders)
            .values({
              orgId: org.id,
              name,
              classification: input.standaloneTarget.classification,
            })
            .returning();
          standaloneBuilderId = b.id;
          buildersCreated++;
        }
      } else {
        const [b] = await tx
          .select({ id: builders.id })
          .from(builders)
          .where(
            and(
              eq(builders.id, input.standaloneTarget.builderId),
              eq(builders.orgId, org.id),
            ),
          )
          .limit(1);
        if (!b) throw new Error("Standalone target builder not found");
        standaloneBuilderId = b.id;
      }
      // Attach the standalone target to the deal (idempotent).
      const [existingLink] = await tx
        .select({ id: dealBuyers.id })
        .from(dealBuyers)
        .where(
          and(
            eq(dealBuyers.dealId, input.dealId),
            eq(dealBuyers.builderId, standaloneBuilderId),
          ),
        )
        .limit(1);
      if (!existingLink) {
        await tx.insert(dealBuyers).values({
          orgId: org.id,
          dealId: input.dealId,
          builderId: standaloneBuilderId,
          tier: "not_selected",
        });
        buildersAttached++;
      }
    }

    // Step 2: attach each has-builder contact's builder to the deal so the
    // builder card has the metadata (tier, lead, called/OM-sent) it needs.
    // De-duped per builder so 5 Lennar contacts → 1 attach attempt not 5.
    const uniqueBuilderIds = Array.from(
      new Set(withBuilder.map((r) => r.builderId).filter((id): id is string => id !== null)),
    );
    if (uniqueBuilderIds.length > 0) {
      const existing = await tx
        .select({ builderId: dealBuyers.builderId })
        .from(dealBuyers)
        .where(
          and(
            eq(dealBuyers.dealId, input.dealId),
            inArray(dealBuyers.builderId, uniqueBuilderIds),
          ),
        );
      const alreadyAttached = new Set(existing.map((r) => r.builderId));
      const toAttach = uniqueBuilderIds.filter((id) => !alreadyAttached.has(id));
      if (toAttach.length > 0) {
        await tx.insert(dealBuyers).values(
          toAttach.map((builderId) => ({
            orgId: org.id,
            dealId: input.dealId,
            builderId,
            tier: "not_selected" as const,
          })),
        );
        buildersAttached += toAttach.length;
      }
    }

    // Step 3: re-point standalone contacts at the resolved builder if one
    // was picked. Skipped when no target — they remain standalones.
    if (standalones.length > 0 && standaloneBuilderId) {
      const ids = standalones.map((r) => r.id);
      await tx.update(contacts).set({ builderId: standaloneBuilderId }).where(inArray(contacts.id, ids));
      contactsRepointed = ids.length;
    }

    // Step 4: insert a deal_contacts row for each selected contact. THIS is
    // the new explicit assignment — without these rows, the contact won't
    // show up on the deal regardless of builder presence. ON CONFLICT DO
    // NOTHING handles the re-add-already-on-deal case as a no-op.
    const allContactIds = rows.map((r) => r.id);
    const insertResult = await tx
      .insert(dealContacts)
      .values(
        allContactIds.map((contactId) => ({
          orgId: org.id,
          dealId: input.dealId,
          contactId,
        })),
      )
      .onConflictDoNothing()
      .returning();
    dealContactsAdded = insertResult.length;
  });

  revalidatePath(`/deals/${input.dealId}`);
  return {
    added: dealContactsAdded,
    buildersAttached,
    buildersCreated,
    contactsRepointed,
  };
}

// Removes a single contact from a deal. Deletes their deal_contacts row;
// if that was the last contact for their builder on the deal, the builder
// card disappears from the UI on next render (purely query-derived — the
// dealBuyer row stays so any tier/lead/called metadata persists for if the
// builder gets re-added later via another contact).
export async function removeContactFromDeal(input: {
  dealId: string;
  contactId: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(dealContacts)
    .where(
      and(
        eq(dealContacts.dealId, input.dealId),
        eq(dealContacts.contactId, input.contactId),
        eq(dealContacts.orgId, org.id),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Quick on/off toggle for the per-contact "receives communication" flag.
// Used by the inline toggle on the cards UI so the user doesn't have to
// open the edit modal just to opt someone in / out of email blasts.
export async function setContactReceivesCommunication(input: {
  dealId: string;
  contactId: string;
  receivesCommunication: boolean;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(contacts)
    .set({ receivesCommunication: input.receivesCommunication })
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// Preview computation for the OM-blast modal. Returns the contacts that
// WOULD be emailed given the chosen filters — no email is actually sent
// (Phase 2 work, blocked on landadvisors.com DNS / Resend setup).
//
// Filters compose as AND:
//   - tier IN tiers (multi-select; e.g. green + yellow)
//   - dealBuyer.leadUserId === assigneeUserId (when set; null = anyone)
//   - contact.receivesCommunication = true (always)
//
// The receives-communication check is non-negotiable: even if a contact
// matches every other filter, opt-out wins. Keeps the data model honest:
// no UI affordance can re-include an opted-out contact.
export type BlastPreviewRow = {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  builderName: string;
  builderId: string;
  tier: "green" | "yellow" | "red" | "not_selected";
  leadUserId: string | null;
  leadName: string | null;
  // Per-builder "OM already sent" timestamp from deal_buyers. Used by
  // the OM-blast modal to warn the user before they send a duplicate
  // OM to a builder they already hit. Null when nothing has been sent
  // yet. Same value across every contact in a given builder group.
  omSentAt: Date | null;
  // Mirror of omSentAt for the Phase 2 "Share DD Folder" send.
  ddSentAt: Date | null;
};

export async function previewBlastRecipients(input: {
  dealId: string;
  tiers: ("green" | "yellow" | "red" | "not_selected")[];
  // null = no assignee filter (any builder, regardless of lead).
  assigneeUserId: string | null;
  // Filter out builders whose offer_received_at is set. Used by the
  // "Follow up Missing Offers" send so we don't bug builders who have
  // already responded.
  excludeOfferReceived?: boolean;
}): Promise<BlastPreviewRow[]> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  if (input.tiers.length === 0) return [];

  // Pull every contact on the deal whose builder is on the deal AND
  // matches the tier filter AND (when assigneeUserId is set) is led by
  // that user. Skip contacts without an email since they can't receive
  // a blast anyway. Skip opted-out contacts (receivesCommunication=false).
  const rows = await db
    .select({
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      builderId: builders.id,
      builderName: builders.name,
      tier: dealBuyers.tier,
      leadUserId: dealBuyers.leadUserId,
      leadName: authUser.name,
      omSentAt: dealBuyers.omSentAt,
      ddSentAt: dealBuyers.ddSentAt,
    })
    .from(dealContacts)
    .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
    .innerJoin(builders, eq(builders.id, contacts.builderId))
    .innerJoin(
      dealBuyers,
      and(
        eq(dealBuyers.builderId, contacts.builderId),
        eq(dealBuyers.dealId, input.dealId),
      ),
    )
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(
      and(
        eq(dealContacts.dealId, input.dealId),
        eq(dealContacts.orgId, org.id),
        eq(contacts.receivesCommunication, true),
        inArray(dealBuyers.tier, input.tiers),
        input.assigneeUserId
          ? eq(dealBuyers.leadUserId, input.assigneeUserId)
          : undefined,
        input.excludeOfferReceived
          ? sql`${dealBuyers.offerReceivedAt} IS NULL`
          : undefined,
      ),
    )
    .orderBy(asc(builders.name), asc(contacts.lastName), asc(contacts.firstName));

  return rows.map((r) => ({
    contactId: r.contactId,
    contactName: `${r.contactFirstName} ${r.contactLastName}`.trim(),
    contactEmail: r.contactEmail,
    builderName: r.builderName,
    builderId: r.builderId,
    tier: r.tier,
    leadUserId: r.leadUserId,
    leadName: r.leadName,
    omSentAt: r.omSentAt,
    ddSentAt: r.ddSentAt,
  }));
}

// Leads currently assigned on this deal — pulled from dealBuyers.leadUserId.
// Used by the OM-blast filter dropdown so the picker only surfaces people
// who are actually leading a builder on this deal (per Chris: org-wide
// would show every member of the org including coordinators who never
// lead a buyer relationship — noise).
export async function getLeadsOnDeal(input: {
  dealId: string;
}): Promise<{ id: string; name: string }[]> {
  const org = await getCurrentOrg();
  if (!org) return [];

  const rows = await db
    .selectDistinct({
      id: users.id,
      name: authUser.name,
      email: authUser.email,
    })
    .from(dealBuyers)
    .innerJoin(users, eq(users.id, dealBuyers.leadUserId))
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.orgId, org.id)))
    .orderBy(asc(authUser.name));

  return rows.map((r) => ({ id: r.id, name: r.name || r.email }));
}

// Org-wide lead options — for callers that need them without going through
// loadBuyers (e.g., the OM-blast button on the checklist row, where the
// page hasn't loaded buyer data yet).
export async function getLeadOptionsForOrg(): Promise<{ id: string; name: string }[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({ id: users.id, name: authUser.name, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(users.orgId, org.id))
    .orderBy(asc(authUser.name));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email }));
}

// Available "From:" choices for outbound client-facing email. Only
// landadvisors.com is verified in Resend, so the only choice today is
// Chris's address. Kept as a typed list (not a constant) so we can grow
// to per-user landadvisors addresses without changing the call sites.
export type EmailSenderOption = {
  id: string;
  // Display name shown alongside the address (e.g. "Chris Shiota").
  name: string;
  email: string;
  // First name used for {{senderName}} substitution in templated bodies.
  firstName: string;
};

const CHRIS_SENDER: EmailSenderOption = {
  id: "chris-landadvisors",
  name: "Chris Shiota",
  email: "cshiota@landadvisors.com",
  firstName: "Chris",
};

// Effective composer sender = Chris by default; `DEV_BLAST_SENDER_EMAIL`
// swaps just the address when set (display name + first name unchanged)
// so a local dev can route blasts through a different verified Resend
// domain without touching production behavior.
const ACTIVE_BLAST_SENDER: EmailSenderOption = env.DEV_BLAST_SENDER_EMAIL
  ? { ...CHRIS_SENDER, email: env.DEV_BLAST_SENDER_EMAIL }
  : CHRIS_SENDER;

// Template variables for the OM-blast email composer. Pulled from the deal
// row. Returns sender options too so the preview modal can render the
// "From:" dropdown without a second round-trip.
//
// Sender list is intentionally a single fixed entry — cshiota@landadvisors.com.
// Resend only has the landadvisors.com domain verified; users sign in with
// their @lakebridgecap.com addresses which can't be used as a from-address
// for client-facing sends. Keeping the dropdown (even with one row) so the
// "From" field is visible in the composer, and so we can add per-user
// landadvisors addresses later without restructuring the modal.
export async function getOmBlastTemplateContext(input: { dealId: string }): Promise<{
  vars: Record<string, string>;
  senderOptions: EmailSenderOption[];
  defaultSenderId: string;
}> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const [deal] = await db
    .select({
      name: deals.name,
      city: deals.city,
      units: deals.units,
      type: deals.type,
    })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) throw new Error("Deal not found");

  // Pull the deal's "Offering Date" milestone tracked-date for the
  // {{dueDate}} placeholder used by the Phase 2 offers-due reminder
  // templates (1-week-before today). Loose substring match so a
  // rename like "Offering Date (target)" still resolves. Empty string
  // when the row isn't set — interpolate leaves {{dueDate}} in place
  // so the user notices.
  const offeringDateItems = await db
    .select({ name: checklistItems.name, trackedDate: checklistItems.trackedDate })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const offeringDateRow = offeringDateItems.find((r) =>
    r.name.toLowerCase().includes("offering date"),
  );
  const dueDate = formatOfferingDate(offeringDateRow?.trackedDate ?? null);

  const senderOptions: EmailSenderOption[] = [ACTIVE_BLAST_SENDER];
  const defaultSenderId = ACTIVE_BLAST_SENDER.id;

  return {
    vars: {
      dealName: deal.name,
      city: deal.city ?? "",
      units: deal.units != null ? String(deal.units) : "",
      type: deal.type ?? "",
      senderName: ACTIVE_BLAST_SENDER.firstName,
      dueDate,
    },
    senderOptions,
    defaultSenderId,
  };
}

// "Friday, May 29, 2026" from a date column's YYYY-MM-DD string. Built
// against a local-time Date so the formatted day matches the date the
// user picked (passing the string straight to new Date() treats it as
// UTC midnight, which can roll back a day in negative-offset zones).
function formatOfferingDate(trackedDate: string | null): string {
  if (!trackedDate) return "";
  const [y, m, d] = trackedDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Standalone lookup for the deal's Offering Date tracked-date. Returns
// the raw YYYY-MM-DD string or null. Used by the 1-week notice button's
// pre-flight check so we can refuse to open the composer when the
// Offering Date isn't set.
export async function getOfferingDate(input: {
  dealId: string;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  if (!org) return null;
  const rows = await db
    .select({ name: checklistItems.name, trackedDate: checklistItems.trackedDate })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const row = rows.find((r) => r.name.toLowerCase().includes("offering date"));
  return row?.trackedDate ?? null;
}

// All possible attachments for the OM-blast email — every uploaded file
// AND every external link on the "Offering Memorandum" checklist row.
// The composer modal shows these as a checklist so the user picks which
// to actually attach (a deal can carry e.g. an OM PDF + an exhibits PDF +
// a Dropbox folder link, and Chris may want any combination).
//
// `recommendedIds` flags the modal's default selection: latest file if
// any files exist, else the first link. Single-attachment cases stay
// one-click (the only option is pre-checked).
export type OmAttachmentChoice =
  | {
      id: string;
      kind: "file";
      documentId: string;
      filename: string;
      mimeType: string | null;
      sizeBytes: number | null;
      version: number;
    }
  | { id: string; kind: "link"; url: string; label: string | null };

// Generic version of the attachment loader. Given an explicit checklist
// item ID, returns its files + links shaped for the email composer's
// attachment picker. Used by every blast button (OM, Q&A, Market
// Study, etc.) that pulls attachments from a specific checklist row.
export async function getAttachmentsForItem(input: {
  itemId: string;
}): Promise<{ choices: OmAttachmentChoice[]; recommendedIds: string[] }> {
  const org = await getCurrentOrg();
  if (!org) return { choices: [], recommendedIds: [] };

  const docs = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      version: documents.version,
    })
    .from(documents)
    .where(and(eq(documents.checklistItemId, input.itemId), eq(documents.orgId, org.id)))
    .orderBy(desc(documents.version), desc(documents.uploadedAt));

  const links = await db
    .select({
      id: checklistItemLinks.id,
      url: checklistItemLinks.url,
      label: checklistItemLinks.label,
    })
    .from(checklistItemLinks)
    .where(
      and(
        eq(checklistItemLinks.checklistItemId, input.itemId),
        eq(checklistItemLinks.orgId, org.id),
      ),
    )
    .orderBy(asc(checklistItemLinks.sortOrder), asc(checklistItemLinks.createdAt));

  const choices: OmAttachmentChoice[] = [
    ...docs.map(
      (d): OmAttachmentChoice => ({
        id: `file:${d.id}`,
        kind: "file",
        documentId: d.id,
        filename: d.name,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        version: d.version,
      }),
    ),
    ...links.map(
      (l): OmAttachmentChoice => ({
        id: `link:${l.id}`,
        kind: "link",
        url: l.url,
        label: l.label,
      }),
    ),
  ];

  let recommendedIds: string[] = [];
  if (choices.length > 0) {
    const firstFile = choices.find((c) => c.kind === "file");
    recommendedIds = firstFile ? [firstFile.id] : [choices[0].id];
  }
  return { choices, recommendedIds };
}

// Returns the checklist item id for the deal's "Offering Memorandum"
// row, or null if missing. Used by callers (OmBlastButton on the
// contacts tab toolbar) that don't already have the id on hand.
export async function getOmItemId(input: {
  dealId: string;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  if (!org) return null;
  const itemRows = await db
    .select({ id: checklistItems.id, name: checklistItems.name })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  return (
    itemRows.find((r) => r.name.toLowerCase().includes("offering memorandum"))?.id ??
    null
  );
}

export async function getOmAttachments(input: {
  dealId: string;
}): Promise<{ choices: OmAttachmentChoice[]; recommendedIds: string[] }> {
  const org = await getCurrentOrg();
  if (!org) return { choices: [], recommendedIds: [] };

  // Find the OM checklist item on this deal. Match by name (case-
  // insensitive) — same loose-match style as the OM-blast button so a
  // slight rename doesn't silently lose the attachment.
  const itemRows = await db
    .select({ id: checklistItems.id, name: checklistItems.name })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const omItem = itemRows.find((r) => r.name.toLowerCase().includes("offering memorandum"));
  if (!omItem) return { choices: [], recommendedIds: [] };

  // All files on the OM row, newest first.
  const docs = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      version: documents.version,
    })
    .from(documents)
    .where(
      and(eq(documents.checklistItemId, omItem.id), eq(documents.orgId, org.id)),
    )
    .orderBy(desc(documents.version), desc(documents.uploadedAt));

  // All external links on the OM row.
  const links = await db
    .select({
      id: checklistItemLinks.id,
      url: checklistItemLinks.url,
      label: checklistItemLinks.label,
    })
    .from(checklistItemLinks)
    .where(
      and(
        eq(checklistItemLinks.checklistItemId, omItem.id),
        eq(checklistItemLinks.orgId, org.id),
      ),
    )
    .orderBy(asc(checklistItemLinks.sortOrder), asc(checklistItemLinks.createdAt));

  const choices: OmAttachmentChoice[] = [
    ...docs.map(
      (d): OmAttachmentChoice => ({
        // Composite id so files and links can never collide in the
        // selection Set on the client even if a UUID coincidence happened.
        id: `file:${d.id}`,
        kind: "file",
        documentId: d.id,
        filename: d.name,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        version: d.version,
      }),
    ),
    ...links.map(
      (l): OmAttachmentChoice => ({
        id: `link:${l.id}`,
        kind: "link",
        url: l.url,
        label: l.label,
      }),
    ),
  ];

  // Default selection: prefer latest file. No file? First link. No
  // anything? Empty (modal just hides the section).
  let recommendedIds: string[] = [];
  if (choices.length > 0) {
    const firstFile = choices.find((c) => c.kind === "file");
    recommendedIds = firstFile ? [firstFile.id] : [choices[0].id];
  }

  return { choices, recommendedIds };
}

// Org-wide CC options — every org member, with email so the picker
// chip can show "Name <email>". Loaded fresh each preview-open so a
// just-added member is immediately CC-able.
export type CcUserOption = {
  id: string;
  name: string;
  email: string;
};

export async function getOrgCcOptions(): Promise<CcUserOption[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({ id: users.id, name: authUser.name, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(users.orgId, org.id))
    .orderBy(asc(authUser.name));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email, email: r.email }));
}

// Owner Team CC options for a deal. Surfaces every owner-team member
// (sellers / principals) that has an email address so the user can
// CC them on a buyer blast without leaving the composer.
//
// IDs use the `owner:` sentinel prefix so the BlastModal's persistence
// layer can tell user-derived CCs (uuid → cc_user_ids) apart from
// owner CCs (sentinel → per-send only). Owner CCs aren't persisted
// because cc_user_ids is a uuid array; persisting them would require a
// schema change for what's currently a low-frequency use case.
export async function getOwnerTeamCcOptions(input: {
  dealId: string;
}): Promise<CcUserOption[]> {
  const org = await getCurrentOrg();
  if (!org) return [];

  const rows = await db
    .select({
      id: dealTeamMembers.id,
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      userName: authUser.name,
      userEmail: authUser.email,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(
      and(
        eq(dealTeamMembers.dealId, input.dealId),
        eq(dealTeamMembers.orgId, org.id),
        eq(dealTeamMembers.team, "owner"),
      ),
    )
    .orderBy(dealTeamMembers.sortOrder, dealTeamMembers.createdAt);

  const opts: CcUserOption[] = [];
  for (const r of rows) {
    let name: string | null = null;
    let email: string | null = null;
    if (r.userId && (r.userName || r.userEmail)) {
      name = r.userName || r.userEmail;
      email = r.userEmail;
    } else if (r.contactId && (r.contactFirst || r.contactLast)) {
      name = `${r.contactFirst ?? ""} ${r.contactLast ?? ""}`.trim();
      email = r.contactEmail;
    } else if (r.freeName) {
      name = r.freeName;
      email = r.freeEmail;
    }
    // No email = can't CC. Skip so the picker doesn't show an
    // unusable row.
    if (!email || !name) continue;
    opts.push({ id: `owner:${r.id}`, name, email });
  }
  return opts;
}

// Existing per-builder CC selections — Map-of-builderId-to-userIds shape
// expected by the EmailPreviewModal. Empty array for builders with no
// CCs configured. Stale ids in cc_user_ids (e.g. a deleted user) are
// kept here as-is; the modal filters them out at render time when it
// can't resolve the id against ccOptions.
export type BuilderCcSelection = {
  builderId: string;
  userIds: string[];
};

export async function getCcSelectionsForBuilders(input: {
  dealId: string;
  builderIds: string[];
}): Promise<BuilderCcSelection[]> {
  const org = await getCurrentOrg();
  if (!org || input.builderIds.length === 0) return [];

  const rows = await db
    .select({
      builderId: dealBuyers.builderId,
      ccUserIds: dealBuyers.ccUserIds,
    })
    .from(dealBuyers)
    .where(
      and(
        eq(dealBuyers.dealId, input.dealId),
        eq(dealBuyers.orgId, org.id),
        inArray(dealBuyers.builderId, input.builderIds),
      ),
    );

  return rows.map((r) => ({ builderId: r.builderId, userIds: r.ccUserIds ?? [] }));
}

// ===== Deal Team Roster =====
//
// Three sub-teams per deal: owner / broker / buyer. Members are stored
// as free-text rows (name/email/phone) so people can be recorded before
// they exist in any other table. Each row has an include_in_emails
// toggle that the email composer uses to decide who to CC on Deal-Team
// send actions (Schedule SOO Review, Share DD Material, Send Issues
// PDF, etc.).

type DealTeam = "owner" | "broker" | "buyer";

// One row per Deal Team member. Display fields (name, email, phone)
// resolve from the canonical source (user or contact) when an FK is
// set; otherwise from the row's free-text columns. `source` tells the
// UI where the data came from so it can hide editable identity fields
// for FK-linked rows.
export type DealTeamMemberRow = {
  id: string;
  team: DealTeam;
  roleLabel: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  includeInEmails: boolean;
  sortOrder: number;
  source:
    | { kind: "user"; userId: string }
    | { kind: "contact"; contactId: string; builderName: string | null }
    | { kind: "freetext" };
};

// Pull every Deal Team member on this deal, joining to users / contacts
// to resolve the canonical display data. Stale FKs (someone deleted the
// canonical record) fall back to the row's columns; if those are also
// null the row collapses to "Unknown" — shouldn't happen because of the
// CHECK constraint but we render defensively.
export async function listDealTeam(input: { dealId: string }): Promise<DealTeamMemberRow[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({
      id: dealTeamMembers.id,
      team: dealTeamMembers.team,
      roleLabel: dealTeamMembers.roleLabel,
      notes: dealTeamMembers.notes,
      includeInEmails: dealTeamMembers.includeInEmails,
      sortOrder: dealTeamMembers.sortOrder,
      // Free-text fallback columns
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      freePhone: dealTeamMembers.phone,
      // FK identifiers (used for source kind)
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      // Joined canonical data
      userName: authUser.name,
      userEmail: authUser.email,
      userPhone: users.phone,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      contactBuilderName: builders.name,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .where(
      and(eq(dealTeamMembers.dealId, input.dealId), eq(dealTeamMembers.orgId, org.id)),
    )
    .orderBy(
      dealTeamMembers.team,
      dealTeamMembers.sortOrder,
      dealTeamMembers.createdAt,
    );

  return rows.map((r): DealTeamMemberRow => {
    if (r.userId && r.userName !== null && r.userEmail !== null) {
      return {
        id: r.id,
        team: r.team,
        roleLabel: r.roleLabel,
        name: r.userName || r.userEmail,
        email: r.userEmail,
        phone: r.userPhone,
        notes: r.notes,
        includeInEmails: r.includeInEmails,
        sortOrder: r.sortOrder,
        source: { kind: "user", userId: r.userId },
      };
    }
    if (r.contactId && (r.contactFirst !== null || r.contactLast !== null)) {
      const fullName = `${r.contactFirst ?? ""} ${r.contactLast ?? ""}`.trim();
      return {
        id: r.id,
        team: r.team,
        roleLabel: r.roleLabel,
        name: fullName || "(unnamed contact)",
        email: r.contactEmail,
        phone: r.contactPhone,
        notes: r.notes,
        includeInEmails: r.includeInEmails,
        sortOrder: r.sortOrder,
        source: {
          kind: "contact",
          contactId: r.contactId,
          builderName: r.contactBuilderName,
        },
      };
    }
    // Free-text path. Or stale FK with null join (canonical record
    // gone) — we fall back to the snapshot columns if any.
    return {
      id: r.id,
      team: r.team,
      roleLabel: r.roleLabel,
      name: r.freeName || "(unknown)",
      email: r.freeEmail,
      phone: r.freePhone,
      notes: r.notes,
      includeInEmails: r.includeInEmails,
      sortOrder: r.sortOrder,
      source: { kind: "freetext" },
    };
  });
}

// Pickable user for the Broker picker.
export type TeamPickerUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
};

// Pickable contact for either the Broker (org-wide) or Buyer
// (deal-scoped) picker. Builder name included so the modal can
// disambiguate people with the same first name across builders.
export type TeamPickerContact = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  builderName: string | null;
};

// Org-wide users for the Broker picker.
export async function listOrgUsersForTeamPicker(): Promise<TeamPickerUser[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({
      id: users.id,
      name: authUser.name,
      email: authUser.email,
      phone: users.phone,
    })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(users.orgId, org.id))
    .orderBy(asc(authUser.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.email,
    email: r.email,
    phone: r.phone,
  }));
}

// Org-wide contacts for the Broker picker. Brokers might be cobrokers
// from outside firms — add them to the contacts directory first, then
// pick into the broker team.
export async function listOrgContactsForTeamPicker(): Promise<TeamPickerContact[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      builderName: builders.name,
    })
    .from(contacts)
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .where(eq(contacts.orgId, org.id))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  return rows.map((r) => ({
    id: r.id,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: r.phone,
    title: r.title,
    builderName: r.builderName,
  }));
}

// Deal-scoped contacts for the Buyer picker. Limits options to people
// already on this deal (via deal_contacts) so the buyer team is a
// curated subset of "the buyers we're talking to."
export async function listDealContactsForTeamPicker(input: {
  dealId: string;
}): Promise<TeamPickerContact[]> {
  const org = await getCurrentOrg();
  if (!org) return [];
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      builderName: builders.name,
    })
    .from(dealContacts)
    .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .where(
      and(eq(dealContacts.dealId, input.dealId), eq(contacts.orgId, org.id)),
    )
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  return rows.map((r) => ({
    id: r.id,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: r.phone,
    title: r.title,
    builderName: r.builderName,
  }));
}

export type AddDealTeamMemberInput = {
  dealId: string;
  team: DealTeam;
  roleLabel: string;
  notes?: string | null;
} & (
  | { source: "user"; userId: string }
  | { source: "contact"; contactId: string }
  | {
      source: "freetext";
      name: string;
      email?: string | null;
      phone?: string | null;
    }
);

// Per-member payload for the batch insert below. Mirrors
// AddDealTeamMemberInput minus the deal-level `dealId` (lifted to the
// top-level call). Spelled out as its own union (instead of Omit on
// AddDealTeamMemberInput) so TypeScript narrows discriminated branches
// correctly inside the batch loop.
export type AddDealTeamMemberPayload = {
  team: DealTeam;
  roleLabel: string;
  notes?: string | null;
} & (
  | { source: "user"; userId: string }
  | { source: "contact"; contactId: string }
  | {
      source: "freetext";
      name: string;
      email?: string | null;
      phone?: string | null;
    }
);

// Batch insert. Used by the Add Member(s) modal which stages multiple
// rows and commits them in one click. Same identity rules as single-add
// (FK or free-text, mutually exclusive). Sort orders are assigned
// consecutively from the current max, scoped per sub-team, so members
// added in one batch land in click order.
export async function addDealTeamMembers(input: {
  dealId: string;
  members: AddDealTeamMemberPayload[];
}): Promise<{ count: number }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  if (input.members.length === 0) return { count: 0 };

  // Compute the next sort_order per team once, then increment locally
  // as we build the insert payload. One round-trip for the max query,
  // one for the insert.
  const teamsInBatch = Array.from(new Set(input.members.map((m) => m.team)));
  const nextByTeam = new Map<DealTeam, number>();
  for (const t of teamsInBatch) {
    const tail = await db
      .select({ next: sql<number>`coalesce(max(${dealTeamMembers.sortOrder}) + 1, 0)` })
      .from(dealTeamMembers)
      .where(
        and(
          eq(dealTeamMembers.dealId, input.dealId),
          eq(dealTeamMembers.orgId, org.id),
          eq(dealTeamMembers.team, t),
        ),
      );
    nextByTeam.set(t, tail[0]?.next ?? 0);
  }

  const rows = input.members.map((m) => {
    const sortOrder = nextByTeam.get(m.team)!;
    nextByTeam.set(m.team, sortOrder + 1);
    const identity =
      m.source === "user"
        ? { userId: m.userId, contactId: null, name: null, email: null, phone: null }
        : m.source === "contact"
          ? { userId: null, contactId: m.contactId, name: null, email: null, phone: null }
          : {
              userId: null,
              contactId: null,
              name: m.name.trim(),
              email: m.email?.trim() || null,
              phone: m.phone?.trim() || null,
            };
    return {
      orgId: org.id,
      dealId: input.dealId,
      team: m.team,
      roleLabel: m.roleLabel.trim(),
      notes: m.notes?.trim() || null,
      sortOrder,
      ...identity,
    };
  });

  await db.insert(dealTeamMembers).values(rows);
  revalidatePath(`/deals/${input.dealId}`);
  return { count: rows.length };
}

export async function addDealTeamMember(
  input: AddDealTeamMemberInput,
): Promise<{ memberId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Sort order = next slot at the end of the current sub-team. Lets the
  // UI render team members in stable insertion order without forcing the
  // caller to compute it.
  const tail = await db
    .select({ next: sql<number>`coalesce(max(${dealTeamMembers.sortOrder}) + 1, 0)` })
    .from(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.dealId, input.dealId),
        eq(dealTeamMembers.orgId, org.id),
        eq(dealTeamMembers.team, input.team),
      ),
    );
  const nextSort = tail[0]?.next ?? 0;

  // Identity branches: only one of (userId, contactId, free-text columns)
  // is populated per row. CHECK constraint at the schema layer enforces
  // this; we mirror the discipline here so reads stay clean.
  const identity =
    input.source === "user"
      ? { userId: input.userId, contactId: null, name: null, email: null, phone: null }
      : input.source === "contact"
        ? { userId: null, contactId: input.contactId, name: null, email: null, phone: null }
        : {
            userId: null,
            contactId: null,
            name: input.name.trim(),
            email: input.email?.trim() || null,
            phone: input.phone?.trim() || null,
          };

  const [created] = await db
    .insert(dealTeamMembers)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      team: input.team,
      roleLabel: input.roleLabel.trim(),
      notes: input.notes?.trim() || null,
      sortOrder: nextSort,
      ...identity,
    })
    .returning();

  revalidatePath(`/deals/${input.dealId}`);
  return { memberId: created.id };
}

// Edit a team member's per-deal context (role, notes). For free-text
// rows, also accepts updated identity fields. FK rows ignore the
// identity fields entirely — to "change who" a row links to, remove
// + re-add (cleaner audit story than mutating the link in place).
export async function updateDealTeamMember(input: {
  memberId: string;
  dealId: string;
  roleLabel: string;
  notes?: string | null;
  // Free-text rows only: identity overrides. Ignored when the row has
  // a userId or contactId set.
  name?: string;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Look up the row first to know if it's free-text (so we know whether
  // to apply the identity fields). One small extra query in exchange
  // for not silently dropping identity edits on FK rows.
  const [row] = await db
    .select({
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
    })
    .from(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Team member not found");

  const isFreeText = !row.userId && !row.contactId;
  const updates: Partial<typeof dealTeamMembers.$inferInsert> = {
    roleLabel: input.roleLabel.trim(),
    notes: input.notes?.trim() || null,
  };
  if (isFreeText && input.name !== undefined) {
    updates.name = input.name.trim() || null;
    updates.email = input.email?.trim() || null;
    updates.phone = input.phone?.trim() || null;
  }

  await db
    .update(dealTeamMembers)
    .set(updates)
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

export async function removeDealTeamMember(input: {
  memberId: string;
  dealId: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Recipients pulled from the Deal Team Roster, scoped to a single
// sub-team and filtered to members with includeInEmails = true. Used
// by the "Send Issues PDF", "Send Consultant Roster", and similar
// Deal-Team-targeted send actions. Each recipient is shaped to fit the
// EmailPreviewModal's EmailRecipient type so the modal can render
// per-builder/per-team groupings without knowing about the team table.
//
// Identity resolution mirrors listDealTeam: user FK -> auth_user join,
// contact FK -> contacts + builders join, else free-text columns.
// Members without an email are kept in the result list but with
// contactEmail = null; the modal filters them out at the recipient
// step (and shows a "(N without email)" warning).
//
// `builderId` semantics for the team context: since these are deal-team
// members, not buyer-side contacts, the groupBy-builder logic in the
// preview modal would otherwise show each as their own group. Pass the
// team's sub-team key (owner / broker / buyer) as the builderId so the
// modal groups by sub-team instead. The display builderName is the
// human label ("Broker Team", etc.).
export type DealTeamRecipientGroup = "owner" | "broker" | "buyer";

const DEAL_TEAM_GROUP_LABEL: Record<DealTeamRecipientGroup, string> = {
  owner: "Owner Team",
  broker: "Broker Team",
  buyer: "Buyer Team",
};

export type DealTeamRecipient = {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  builderId: string;
  builderName: string;
};

export async function getDealTeamRecipients(input: {
  dealId: string;
  // Sub-teams to pull from. Order in the array determines group
  // ordering in the preview modal's per-builder paginator.
  teams: DealTeamRecipientGroup[];
}): Promise<DealTeamRecipient[]> {
  const org = await getCurrentOrg();
  if (!org || input.teams.length === 0) return [];

  const rows = await db
    .select({
      id: dealTeamMembers.id,
      team: dealTeamMembers.team,
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      userName: authUser.name,
      userEmail: authUser.email,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(
      and(
        eq(dealTeamMembers.dealId, input.dealId),
        eq(dealTeamMembers.orgId, org.id),
        eq(dealTeamMembers.includeInEmails, true),
        inArray(dealTeamMembers.team, input.teams),
      ),
    )
    .orderBy(
      dealTeamMembers.team,
      dealTeamMembers.sortOrder,
      dealTeamMembers.createdAt,
    );

  return rows.map((r) => {
    let name = "(unknown)";
    let email: string | null = null;
    if (r.userId && (r.userName || r.userEmail)) {
      name = r.userName || r.userEmail!;
      email = r.userEmail;
    } else if (r.contactId && (r.contactFirst || r.contactLast)) {
      name = `${r.contactFirst ?? ""} ${r.contactLast ?? ""}`.trim();
      email = r.contactEmail;
    } else if (r.freeName) {
      name = r.freeName;
      email = r.freeEmail;
    }
    return {
      contactId: r.id,
      contactName: name,
      contactEmail: email,
      // Group all recipients of a given sub-team together so the
      // preview paginator shows one "email" per sub-team (Broker Team,
      // Owner Team, etc.) instead of one per person.
      builderId: r.team,
      builderName: DEAL_TEAM_GROUP_LABEL[r.team],
    };
  });
}

export async function setDealTeamMemberIncluded(input: {
  memberId: string;
  dealId: string;
  included: boolean;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .update(dealTeamMembers)
    .set({ includeInEmails: input.included })
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Server-action entry point for the OM blast + Deal Team Send composers.
// Thin wrapper: org-scopes the request, then hands off to the blast
// helper which fetches Blob attachments and calls Resend per builder.
//
// We don't re-derive recipients / subject / body server-side — the user
// already edited them in the preview modal. The trust boundary is the
// org check + attachment ownership check inside sendResolvedEmails: a
// forged documentId from a sibling org can't pull a file.
//
// `dealId` is required when any attachment uses kind: "generated" —
// generators render server-side from the deal's data and need to know
// which deal. Optional otherwise (file / link attachments don't need it).
export async function sendBlastEmails(
  emails: ResolvedEmail[],
  opts?: { dealId?: string },
): Promise<BlastSendResult> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  return sendResolvedEmails(emails, { orgId: org.id, dealId: opts?.dealId });
}

// Bulk-mark a per-buyer "sent" timestamp = now() for the given builders
// on a deal. Called by the blast composer after a successful send so
// the corresponding tracking flag on the buyer card flips automatically,
// and the next send of the same kind defaults those builders to
// unchecked in the recipient list. One UPDATE vs N setBuyer* calls.
//
// `field` selects which column gets stamped:
//   - "om" → om_sent_at, driven by the OM blast
//   - "dd" → dd_sent_at, driven by the Phase 2 Share DD Folder send
//
// Phase 4's "Share DD Material" goes to the deal team, not to buyers,
// and does NOT call this helper.
export async function markBuildersSent(input: {
  dealId: string;
  builderIds: string[];
  field: "om" | "dd";
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  if (input.builderIds.length === 0) return;

  const now = new Date();
  const patch = input.field === "om" ? { omSentAt: now } : { ddSentAt: now };

  await db
    .update(dealBuyers)
    .set(patch)
    .where(
      and(
        eq(dealBuyers.dealId, input.dealId),
        eq(dealBuyers.orgId, org.id),
        inArray(dealBuyers.builderId, input.builderIds),
      ),
    );

  revalidatePath(`/deals/${input.dealId}`);
}

// Verifies that an item belongs to the active deal. Useful for any
// action that takes an itemId from the client. Lightweight no-op if the
// join holds.
export async function assertItemOnDeal(itemId: string, dealId: string) {
  const [row] = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(and(eq(checklistItems.id, itemId), eq(checklistCategories.dealId, dealId)))
    .limit(1);
  if (!row) throw new Error("Item not on deal");
}
