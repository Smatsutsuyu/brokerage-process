"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  checklistCategories,
  checklistItems,
  consultants,
  contacts,
  dealBuyers,
  dealContacts,
  deals,
  issues,
  qaItems,
  users,
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
    if (input.newBuilderName?.trim()) {
      const name = input.newBuilderName.trim();
      const [builder] = await tx
        .insert(builders)
        .values({
          orgId: org.id,
          name,
          classification: input.newBuilderClassification ?? "private",
        })
        .returning();
      await tx.insert(dealBuyers).values({
        orgId: org.id,
        dealId: input.dealId,
        builderId: builder.id,
        tier: "not_selected",
      });
      builderId = builder.id;
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
        const [b] = await tx
          .insert(builders)
          .values({
            orgId: org.id,
            name: input.standaloneTarget.name.trim(),
            classification: input.standaloneTarget.classification,
          })
          .returning();
        standaloneBuilderId = b.id;
        buildersCreated++;
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
};

export async function previewBlastRecipients(input: {
  dealId: string;
  tiers: ("green" | "yellow" | "red" | "not_selected")[];
  // null = no assignee filter (any builder, regardless of lead).
  assigneeUserId: string | null;
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
  }));
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
