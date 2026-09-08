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
import { auditSafely, truncateForAudit, writeAudit } from "@/lib/audit";
import { MAX_LOGGED_AUDIT_IDS } from "@/lib/audit-shared";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { findBuilderByName } from "@/lib/builders";
import { ROLE_LABEL as CONSULTANT_ROLE_LABEL } from "@/lib/consultant-roles";
import { parseEmailAddress } from "@/lib/email-address";
import { sendResolvedEmails, type BlastSendResult } from "@/lib/email/blast";
import {
  buildUnifiedComposerData,
  type UnifiedDealTeamComposerData,
} from "@/lib/email/unified-deal-team";
import {
  buildPsaKickoffComposerData,
  type PsaKickoffComposerData,
} from "@/lib/psa-attorney";
import { env } from "@/lib/env";
import { formatMilestoneDate } from "@/lib/format-milestone-date";
import { formatPhone } from "@/lib/phone";
import type { ResolvedEmail } from "@/components/email/email-preview-modal";

// Pre-mutation snapshot for the three checklist-item actions below.
//
// Every checklist update is otherwise blind (`db.update(...).where(...)` with
// no prior read), so without this the audit trail could only record that
// something changed, not what it changed from. The joins to
// checklist_categories and deals cost one round-trip and buy two things: the
// item name and deal name get denormalized into the audit row so an entry
// reads as a sentence without a join, and the deal id comes from the database
// rather than from client-supplied `input.dealId`.
//
// Returns null when the item does not exist or belongs to another org, which
// is exactly when the caller's own org-scoped update would no-op. Callers skip
// the audit write in that case rather than logging a change that never landed.
async function loadChecklistItemAuditContext(itemId: string, orgId: string) {
  const [row] = await db
    .select({
      name: checklistItems.name,
      completed: checklistItems.completed,
      trackedDate: checklistItems.trackedDate,
      estimatedDate: checklistItems.estimatedDate,
      notes: checklistItems.notes,
      dealId: checklistCategories.dealId,
      dealName: deals.name,
    })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistCategories.id, checklistItems.categoryId))
    .innerJoin(deals, eq(deals.id, checklistCategories.dealId))
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function toggleChecklistItem(input: {
  itemId: string;
  dealId: string;
  completed: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  // Set completer identity on check, clear on uncheck. Nullable users FK
  // (onDelete: set null) means a deleted user later surfaces as null,
  // which the read side renders as "Unknown".
  const user = await getCurrentUser();
  // getCurrentOrg short-circuits on a null user, so we're guaranteed a
  // user here in practice. Assert loudly so any future refactor that
  // breaks the invariant fails fast instead of silently writing anonymous
  // completions with completedBy=null.
  if (!user) throw new Error("No user context");

  const before = await loadChecklistItemAuditContext(input.itemId, org.id);

  // Scope the update to the current org so a forged itemId can't reach across tenants.
  await db
    .update(checklistItems)
    .set({
      completed: input.completed,
      completedAt: input.completed ? new Date() : null,
      completedBy: input.completed ? user.id : null,
    })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  // Skip the audit write when the checkbox already held this value. The UI
  // can re-send the current state (double click, stale optimistic render) and
  // a row saying "changed from false to false" is noise in a log whose whole
  // job is to make real changes findable.
  if (before && before.completed !== input.completed) {
    await writeAudit({
      orgId: org.id,
      userId: user.id,
      action: input.completed ? "checklist_item.completed" : "checklist_item.uncompleted",
      entityType: "checklist_item",
      entityId: input.itemId,
      before: { completed: before.completed },
      after: { completed: input.completed },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: before.name,
      },
    });
  }

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

// Same pre-mutation snapshot as loadChecklistItemAuditContext, one level
// deeper. The link actions only receive a link id, so resolving up through
// the parent item to the deal is what lets an entry carry dealId / dealName
// and name the item the link hangs off. Both the update and the delete write
// blind, and the delete destroys the URL outright: afterwards this snapshot
// is the only surviving record of what was attached.
//
// Null means the link is gone or belongs to another org, which is exactly
// when the caller's org-scoped write no-ops, so callers skip the audit.
async function loadChecklistItemLinkAuditContext(linkId: string, orgId: string) {
  const [row] = await db
    .select({
      url: checklistItemLinks.url,
      label: checklistItemLinks.label,
      checklistItemId: checklistItemLinks.checklistItemId,
      itemName: checklistItems.name,
      dealId: checklistCategories.dealId,
      dealName: deals.name,
    })
    .from(checklistItemLinks)
    .innerJoin(checklistItems, eq(checklistItems.id, checklistItemLinks.checklistItemId))
    .innerJoin(checklistCategories, eq(checklistCategories.id, checklistItems.categoryId))
    .innerJoin(deals, eq(deals.id, checklistCategories.dealId))
    .where(and(eq(checklistItemLinks.id, linkId), eq(checklistItemLinks.orgId, orgId)))
    .limit(1);
  return row ?? null;
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

  const user = await getCurrentUser();
  // Verify the parent item belongs to this org before creating the link.
  // The audit-context loader answers that same question (null means missing
  // or another org) and hands back the item and deal names the audit row
  // needs, so it stands in for the bare existence check rather than running
  // a second query alongside it.
  const item = await loadChecklistItemAuditContext(input.itemId, org.id);
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

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "checklist_item_link.added",
    entityType: "checklist_item_link",
    entityId: created.id,
    // url and label are uncapped text columns, so every link entry runs both
    // through truncateForAudit before they reach jsonb.
    after: { url: truncateForAudit(created.url), label: truncateForAudit(created.label) },
    metadata: {
      dealId: item.dealId,
      dealName: item.dealName,
      label: item.name,
      checklistItemId: input.itemId,
    },
  });

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
  const label = input.label?.trim() || null;

  const user = await getCurrentUser();
  const before = await loadChecklistItemLinkAuditContext(input.linkId, org.id);

  await db
    .update(checklistItemLinks)
    .set({ url, label })
    .where(
      and(eq(checklistItemLinks.id, input.linkId), eq(checklistItemLinks.orgId, org.id)),
    );

  // Repointing the URL and renaming the link are both worth a row. Re-saving
  // the dialog without touching either field is not.
  if (before && (before.url !== url || before.label !== label)) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "checklist_item_link.updated",
      entityType: "checklist_item_link",
      entityId: input.linkId,
      before: { url: truncateForAudit(before.url), label: truncateForAudit(before.label) },
      after: { url: truncateForAudit(url), label: truncateForAudit(label) },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: before.itemName,
        checklistItemId: before.checklistItemId,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteChecklistItemLink(input: {
  linkId: string;
  dealId: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  // Snapshot before the row is gone. The link table keeps no history, so
  // this entry becomes the only place the removed URL still exists.
  const before = await loadChecklistItemLinkAuditContext(input.linkId, org.id);

  await db
    .delete(checklistItemLinks)
    .where(
      and(eq(checklistItemLinks.id, input.linkId), eq(checklistItemLinks.orgId, org.id)),
    );

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "checklist_item_link.deleted",
      entityType: "checklist_item_link",
      entityId: input.linkId,
      before: { url: truncateForAudit(before.url), label: truncateForAudit(before.label) },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: before.itemName,
        checklistItemId: before.checklistItemId,
      },
    });
  }

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
  // True when the row's "Est." checkbox is ticked. Replaces the old `kind`
  // discriminator: the checkbox is now the single thing that decides which
  // column is written, so the caller passes its state rather than naming a
  // column.
  isEstimate: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Light validation: must be empty string / null / a YYYY-MM-DD form.
  // Drizzle's date column accepts a string in that shape; anything else
  // would error noisily, so we fail early with a clearer message.
  if (input.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }

  // The row shows ONE date plus an "Est." checkbox, so the checkbox decides
  // which column the write lands in. Two columns are still kept underneath
  // because the gap between them is the only record of slip.
  //
  //   Est. ticked   -> estimated_date = date, and the actual is cleared. The
  //                    user is saying this is not confirmed after all, so a
  //                    stale actual must not keep winning the display.
  //   Est. unticked -> tracked_date = date, and the estimate is LEFT FROZEN.
  //                    That freeze is the whole point: promoting a projection
  //                    to a real date is what captures the slip.
  //
  // Clearing an actual deliberately does not clear the estimate. The row falls
  // back to showing the projection, which is lossless and reads as "undo the
  // confirmation, we are back to the estimate".
  const isEstimate = input.isEstimate;
  const patch = isEstimate
    ? { estimatedDate: input.date, trackedDate: null }
    : { trackedDate: input.date };

  // getCurrentOrg short-circuits on a null user, so `org` being set already
  // implies a signed-in user. Read it anyway to attribute the change: this is
  // the action behind the 2026-08-27 question of who moved a milestone date on
  // a live deal, and per-row attribution never existed for it. Free at runtime
  // because getCurrentUser is wrapped in React cache() and getCurrentOrg has
  // already called it this request.
  const user = await getCurrentUser();
  const before = await loadChecklistItemAuditContext(input.itemId, org.id);

  await db
    .update(checklistItems)
    .set(patch)
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  // Record BOTH columns rather than only the one the checkbox names. A demote
  // writes two of them at once (estimate set, actual cleared), and a promote
  // is only legible next to the estimate it was promoted from, which is
  // exactly the slip a reader comes here to check.
  const nextEstimated = isEstimate ? input.date : (before?.estimatedDate ?? null);
  const nextTracked = isEstimate ? null : input.date;
  const changed =
    before !== null &&
    (before.estimatedDate !== nextEstimated || before.trackedDate !== nextTracked);

  if (before && changed) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: input.date === null ? "checklist_item.date_cleared" : "checklist_item.date_set",
      entityType: "checklist_item",
      entityId: input.itemId,
      before: { estimatedDate: before.estimatedDate, trackedDate: before.trackedDate },
      after: { estimatedDate: nextEstimated, trackedDate: nextTracked },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: before.name,
        // Which side of the row the user was editing. The viewer reads this to
        // render "Set Est. date" vs "Set Actual date" without inferring it
        // from the before/after keys, which now always carry both columns.
        dateKind: isEstimate ? "estimate" : "actual",
        // A promotion is the moment slip becomes measurable, so name it
        // explicitly rather than making a reader diff the two snapshots.
        promotedFromEstimate:
          !isEstimate && input.date !== null && before.trackedDate === null
            ? (before.estimatedDate ?? null)
            : undefined,
      },
    });
  }

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
  const next = trimmed || null;

  const user = await getCurrentUser();
  const before = await loadChecklistItemAuditContext(input.itemId, org.id);

  await db
    .update(checklistItems)
    .set({ notes: next })
    .where(and(eq(checklistItems.id, input.itemId), eq(checklistItems.orgId, org.id)));

  if (before && before.notes !== next) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: next === null ? "checklist_item.notes_cleared" : "checklist_item.notes_updated",
      entityType: "checklist_item",
      entityId: input.itemId,
      // checklist_items.notes has no length cap, so both sides are truncated
      // before they reach jsonb. The log answers who changed the note, not
      // what the note says in full.
      before: { notes: truncateForAudit(before.notes) },
      after: { notes: truncateForAudit(next) },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: before.name,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

// The PSA Attorney decision, split across the two things it actually is.
//
// WHO DRAFTS lives on the deal (deals.psa_drafting). It is a fact about
// the transaction, answered on a Phase 1 go-to-market row months before
// counsel is retained, and when the buyer's counsel drafts it is answered
// before the buyer even exists.
//
// WHO THE ATTORNEY IS lives on the consultant roster as a row with
// role = "psa_attorney", which is the one place in the platform that can
// hold a firm, a contact, an email and a side. The legacy
// deals.psa_attorney_name / psa_attorney_firm columns are free text with
// nowhere to put an address; nothing reads them any more and they are
// scheduled for removal. See docs/backlog.md.
export type PsaDrafting = "buyer" | "seller" | "na";

export async function savePsaAttorneyDecision(input: {
  dealId: string;
  drafting: PsaDrafting | null;
  // Omit to leave the roster untouched and record only the drafting
  // decision. This action never deletes: clearing an attorney is done on
  // the Consultants tab, which is the surface that owns removal.
  attorney?: {
    // Present when editing the row this deal already has.
    consultantId?: string;
    side: ConsultantSide;
    firmName: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Audited as two separate events, never one. This action writes the two
  // facts the comment above keeps apart: who drafts (a column on the deal)
  // and who counsel is (a row on the consultant roster). A single entry
  // would conflate them, and the roster half has to show up under the same
  // action as any other roster edit so the Consultants filter finds it no
  // matter which surface made the change.
  const [dealBefore] = await db
    .select({ id: deals.id, name: deals.name, psaDrafting: deals.psaDrafting })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)))
    .limit(1);

  await db
    .update(deals)
    .set({ psaDrafting: input.drafting })
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)));

  // The panel re-submits the drafting choice on every save, including the
  // saves that only touch the attorney fields.
  if (dealBefore && dealBefore.psaDrafting !== input.drafting) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action:
        input.drafting === null ? "deal.psa_drafting_cleared" : "deal.psa_drafting_set",
      entityType: "deal",
      entityId: dealBefore.id,
      before: { psaDrafting: dealBefore.psaDrafting },
      after: { psaDrafting: input.drafting },
      metadata: {
        dealId: dealBefore.id,
        dealName: dealBefore.name,
        // The deal itself is the target row, so its name is the label.
        label: truncateForAudit(dealBefore.name),
      },
    });
  }

  const a = input.attorney;
  if (a) {
    const firmName = a.firmName.trim();
    if (!firmName) throw new Error("Firm name is required");
    const values = {
      role: "psa_attorney" as const,
      side: a.side,
      firmName,
      contactName: a.contactName?.trim() || null,
      contactEmail: parseEmailAddress(a.contactEmail),
      contactPhone: formatPhone(a.contactPhone),
    };
    if (a.consultantId) {
      const before = await loadConsultantAuditContext(
        org.id,
        input.dealId,
        a.consultantId,
      );

      // Scoped by deal as well as org: this is a second caller for the
      // consultant write path and it must not be able to reach a row on
      // a sibling deal.
      await db
        .update(consultants)
        .set(values)
        .where(
          and(
            eq(consultants.id, a.consultantId),
            eq(consultants.dealId, input.dealId),
            eq(consultants.orgId, org.id),
          ),
        );

      if (before) {
        // This panel has no notes field, so whatever the roster holds
        // carries through untouched into the after row.
        const afterRow = { ...values, notes: before.notes };
        // Diff the raw rows, snapshot only for the payload.
        const changedFields = consultantChangedFields(before, afterRow);
        const beforeSnapshot = consultantSnapshot(before);
        const afterSnapshot = consultantSnapshot(afterRow);
        if (changedFields.length > 0) {
          await writeAudit({
            orgId: org.id,
            userId: user?.id ?? null,
            action: "consultant.updated",
            entityType: "consultant",
            entityId: a.consultantId,
            before: beforeSnapshot,
            after: afterSnapshot,
            metadata: {
              dealId: before.dealId,
              dealName: before.dealName,
              label: consultantLabel({ firmName, role: values.role }),
              changedFields,
              // Same roster edit as one made on the Consultants tab, but
              // worth knowing it came off the Phase 1 checklist row rather
              // than adding a filter row nobody would think to select.
              source: "psa_attorney_row",
            },
          });
        }
      }
    } else {
      const [created] = await db
        .insert(consultants)
        .values({ ...values, orgId: org.id, dealId: input.dealId })
        .returning();

      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "consultant.created",
        entityType: "consultant",
        entityId: created.id,
        after: consultantSnapshot(created),
        metadata: {
          dealId: dealBefore?.id ?? null,
          dealName: dealBefore?.name ?? null,
          label: consultantLabel(created),
          source: "psa_attorney_row",
        },
      });
    }
  }

  revalidatePath(`/deals/${input.dealId}`);
}

// Pre-mutation snapshot for the per-buyer flags and fields below.
//
// Every deal_buyers update in this file writes blind, and the row is
// addressed by ids alone. The builders join is what lets an entry read
// "Lennar" instead of a UUID; the deals join denormalizes the deal name so
// the entry stays readable after a rename. Two key shapes because
// setBuilderCcUsers addresses the row by (dealId, builderId) while the rest
// carry the deal_buyers id.
//
// Returns null when the row is missing or belongs to another org, which is
// exactly when the caller's org-scoped update would no-op. Callers skip the
// audit write in that case rather than logging a change that never landed.
async function loadDealBuyerAuditContext(
  orgId: string,
  key: { dealBuyerId: string } | { dealId: string; builderId: string },
) {
  const [row] = await db
    .select({
      id: dealBuyers.id,
      tier: dealBuyers.tier,
      leadUserId: dealBuyers.leadUserId,
      ccUserIds: dealBuyers.ccUserIds,
      calledAt: dealBuyers.calledAt,
      omSentAt: dealBuyers.omSentAt,
      ddSentAt: dealBuyers.ddSentAt,
      confiSignedAt: dealBuyers.confiSignedAt,
      offerReceivedAt: dealBuyers.offerReceivedAt,
      comments: dealBuyers.comments,
      builderId: dealBuyers.builderId,
      builderName: builders.name,
      dealId: dealBuyers.dealId,
      dealName: deals.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(builders.id, dealBuyers.builderId))
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(
      and(
        eq(dealBuyers.orgId, orgId),
        "dealBuyerId" in key
          ? eq(dealBuyers.id, key.dealBuyerId)
          : and(eq(dealBuyers.dealId, key.dealId), eq(dealBuyers.builderId, key.builderId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

type DealBuyerAuditContext = NonNullable<Awaited<ReturnType<typeof loadDealBuyerAuditContext>>>;

// A builder's human name is `builders.name`, an uncapped text column, and it
// is the label on every buyer and builder entry below. Capped for the viewer's
// label column the way qaLabel caps a question. Null when there is no builder
// at all (a contact can sit unaffiliated), which is what these entries already
// wrote rather than inventing a placeholder name.
function builderLabel(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

// Display names for the two user-valued buyer fields (lead, CC list). Copied
// into the entry rather than joined at read time so it still names the person
// after they leave the org. An id with no membership row drops out of the
// map; the raw id is in before/after either way.
async function resolveUserNamesForAudit(
  orgId: string,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, name: authUser.name, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(users.orgId, orgId), inArray(users.id, ids)));
  return new Map(rows.map((r): [string, string] => [r.id, r.name || r.email]));
}

// The five buyer checkboxes below (Called / OM / DD / Confi / Offer) are one
// action against five columns: stamp a timestamp or clear it. They share this
// writer so the entry shape and the skip-if-unchanged rule are stated once.
async function writeBuyerFlagAudit(args: {
  orgId: string;
  userId: string | null;
  buyer: DealBuyerAuditContext;
  // Timestamp column being written, doubling as the before/after key.
  field: "calledAt" | "omSentAt" | "ddSentAt" | "confiSignedAt" | "offerReceivedAt";
  action: string;
  previous: Date | null;
  next: Date | null;
}): Promise<void> {
  // The box already held this value. The UI can re-send the current state
  // (double click, stale optimistic render) and a blast can re-mark a builder
  // it already marked; a row saying nothing changed is noise in a log whose
  // job is making real changes findable. The re-stamp still happens, it just
  // isn't logged.
  if ((args.previous === null) === (args.next === null)) return;
  await writeAudit({
    orgId: args.orgId,
    userId: args.userId,
    action: args.action,
    entityType: "deal_buyer",
    entityId: args.buyer.id,
    before: { [args.field]: args.previous },
    after: { [args.field]: args.next },
    metadata: {
      dealId: args.buyer.dealId,
      dealName: args.buyer.dealName,
      label: builderLabel(args.buyer.builderName),
      builderId: args.buyer.builderId,
    },
  });
}

export async function updateBuyerTier(input: {
  dealBuyerId: string;
  dealId: string;
  tier: "green" | "yellow" | "red" | "not_selected";
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Tier decides who receives which blast, so a quiet retier silently changes
  // the audience of every later send. That makes this the buyer field where
  // the before value matters most.
  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });

  await db
    .update(dealBuyers)
    .set({ tier: input.tier })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before && before.tier !== input.tier) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_buyer.tier_changed",
      entityType: "deal_buyer",
      entityId: before.id,
      before: { tier: before.tier },
      after: { tier: input.tier },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: builderLabel(before.builderName),
        builderId: before.builderId,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerCalled(input: {
  dealBuyerId: string;
  dealId: string;
  called: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });
  const calledAt = input.called ? new Date() : null;

  await db
    .update(dealBuyers)
    .set({ calledAt })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before) {
    await writeBuyerFlagAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      buyer: before,
      field: "calledAt",
      action: input.called ? "deal_buyer.called_set" : "deal_buyer.called_cleared",
      previous: before.calledAt,
      next: calledAt,
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerOmSent(input: {
  dealBuyerId: string;
  dealId: string;
  omSent: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });
  const omSentAt = input.omSent ? new Date() : null;

  await db
    .update(dealBuyers)
    .set({ omSentAt })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before) {
    await writeBuyerFlagAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      buyer: before,
      field: "omSentAt",
      action: input.omSent ? "deal_buyer.om_sent_set" : "deal_buyer.om_sent_cleared",
      previous: before.omSentAt,
      next: omSentAt,
    });
  }

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

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });
  const ddSentAt = input.ddSent ? new Date() : null;

  await db
    .update(dealBuyers)
    .set({ ddSentAt })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before) {
    await writeBuyerFlagAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      buyer: before,
      field: "ddSentAt",
      action: input.ddSent ? "deal_buyer.dd_sent_set" : "deal_buyer.dd_sent_cleared",
      previous: before.ddSentAt,
      next: ddSentAt,
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerConfiSigned(input: {
  dealBuyerId: string;
  dealId: string;
  confiSigned: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });
  const confiSignedAt = input.confiSigned ? new Date() : null;

  await db
    .update(dealBuyers)
    .set({ confiSignedAt })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before) {
    await writeBuyerFlagAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      buyer: before,
      field: "confiSignedAt",
      action: input.confiSigned
        ? "deal_buyer.confi_signed_set"
        : "deal_buyer.confi_signed_cleared",
      previous: before.confiSignedAt,
      next: confiSignedAt,
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerOfferReceived(input: {
  dealBuyerId: string;
  dealId: string;
  offerReceived: boolean;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });
  const offerReceivedAt = input.offerReceived ? new Date() : null;

  await db
    .update(dealBuyers)
    .set({ offerReceivedAt })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before) {
    await writeBuyerFlagAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      buyer: before,
      field: "offerReceivedAt",
      action: input.offerReceived
        ? "deal_buyer.offer_received_set"
        : "deal_buyer.offer_received_cleared",
      previous: before.offerReceivedAt,
      next: offerReceivedAt,
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setBuyerLead(input: {
  dealBuyerId: string;
  dealId: string;
  leadUserId: string | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });

  await db
    .update(dealBuyers)
    .set({ leadUserId: input.leadUserId })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before && before.leadUserId !== input.leadUserId) {
    // The name lookup is a second round-trip that only the audit entry needs,
    // and it runs after the update has already landed, so it goes through
    // auditSafely: a lookup that fails must not turn a saved lead assignment
    // into a reported failure.
    await auditSafely(async () => {
      // Lead is relationship ownership, so the entry names both people rather
      // than leaving a reader to resolve two user ids by hand.
      const names = await resolveUserNamesForAudit(org.id, [
        before.leadUserId,
        input.leadUserId,
      ]);
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action:
          input.leadUserId === null ? "deal_buyer.lead_cleared" : "deal_buyer.lead_assigned",
        entityType: "deal_buyer",
        entityId: before.id,
        before: {
          leadUserId: before.leadUserId,
          leadName: before.leadUserId ? (names.get(before.leadUserId) ?? null) : null,
        },
        after: {
          leadUserId: input.leadUserId,
          leadName: input.leadUserId ? (names.get(input.leadUserId) ?? null) : null,
        },
        metadata: {
          dealId: before.dealId,
          dealName: before.dealName,
          label: builderLabel(before.builderName),
          builderId: before.builderId,
        },
      });
    });
  }

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

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, {
    dealId: input.dealId,
    builderId: input.builderId,
  });

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

  // Set semantics mean one save can add and remove at once, so this stays a
  // single "updated" action carrying both lists rather than add/remove
  // variants a reader would have to correlate. The stored column has no
  // unique constraint, so the previous list is deduped before comparison:
  // equal length plus subset then means the same set.
  //
  // Known and accepted: the blast composer persists per checkbox toggle, so
  // picking three CC users writes three entries ([A], [A,B], [A,B,C]) while
  // the user is still composing. Every one of those is a real committed
  // change, so suppressing them here would mean logging less than actually
  // happened. The churn is in the caller's per-toggle save, not in the audit,
  // and the fix if it ever gets noisy is to defer onCcChange to popover close.
  const previousCc = Array.from(new Set(before?.ccUserIds ?? []));
  const ccChanged =
    previousCc.length !== deduped.length || previousCc.some((id) => !deduped.includes(id));

  if (before && ccChanged) {
    // Same reasoning as setBuyerLead: the name lookup exists only to make the
    // entry readable and it runs after the CC list has already been written,
    // so it must not be able to fail the save.
    await auditSafely(async () => {
      const names = await resolveUserNamesForAudit(org.id, [...previousCc, ...deduped]);
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "deal_buyer.cc_users_updated",
        entityType: "deal_buyer",
        entityId: before.id,
        before: {
          ccUserIds: previousCc,
          ccUserNames: previousCc.map((id) => names.get(id) ?? id),
        },
        after: {
          ccUserIds: deduped,
          ccUserNames: deduped.map((id) => names.get(id) ?? id),
        },
        metadata: {
          dealId: before.dealId,
          dealName: before.dealName,
          label: builderLabel(before.builderName),
          builderId: before.builderId,
        },
      });
    });
  }

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
  const next = trimmed || null;

  const user = await getCurrentUser();
  const before = await loadDealBuyerAuditContext(org.id, { dealBuyerId: input.dealBuyerId });

  await db
    .update(dealBuyers)
    .set({ comments: next })
    .where(and(eq(dealBuyers.id, input.dealBuyerId), eq(dealBuyers.orgId, org.id)));

  if (before && before.comments !== next) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: next === null ? "deal_buyer.comments_cleared" : "deal_buyer.comments_updated",
      entityType: "deal_buyer",
      entityId: before.id,
      // Uncapped text column that also lands in the Marketing Report PDF, so
      // both sides go through truncateForAudit before reaching jsonb.
      before: { comments: truncateForAudit(before.comments) },
      after: { comments: truncateForAudit(next) },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: builderLabel(before.builderName),
        builderId: before.builderId,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

// Contacts have no single name column, and an entry that can only show a UUID
// is unreadable. Every contact entry below carries this as its label. Both
// halves are uncapped columns, so the joined string is capped for the viewer's
// label column the same way qaLabel caps a question.
function contactLabel(firstName: string, lastName: string): string {
  const joined = `${firstName} ${lastName}`.trim();
  return joined.length > 80 ? `${joined.slice(0, 80)}…` : joined;
}

// The contact fields worth keeping in a before/after snapshot. Deliberately
// the same shape the org-wide directory (`/contacts` actions) writes, so one
// person reads identically in the viewer whichever surface edited them.
// Every string column here is uncapped free text (geography is hand-typed,
// "SoCal" or "Bay Area + Sacramento"), so all of them go through
// truncateForAudit before they reach jsonb.
function contactSnapshot(row: {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  geography: string | null;
  notes: string | null;
  builderId: string | null;
  receivesCommunication: boolean;
}) {
  return {
    firstName: truncateForAudit(row.firstName),
    lastName: truncateForAudit(row.lastName),
    title: truncateForAudit(row.title),
    email: truncateForAudit(row.email),
    phone: truncateForAudit(row.phone),
    geography: truncateForAudit(row.geography),
    notes: truncateForAudit(row.notes),
    builderId: row.builderId,
    receivesCommunication: row.receivesCommunication,
  };
}

// Pre-mutation snapshot for the deal-page contact actions below. All of them
// are otherwise blind (`db.update` / `db.delete` with no prior read) and two
// of them destroy a row, so without this the log could record that a contact
// changed or vanished but not what it held.
//
// The builder join denormalizes the company name, since builder_id on its own
// reads as a bare UUID in the viewer. `deals` is joined on the caller-supplied
// id rather than through a relationship: contacts are org-scoped, so the deal
// is the surface the change was made from, not a property of the row. Both
// joins are left joins so a contact with no builder (or, theoretically, a deal
// id from another tenant) still yields a snapshot instead of nothing.
//
// Returns null when the contact does not exist or belongs to another org,
// which is exactly when the caller's own org-scoped write no-ops. Callers skip
// the audit entry in that case rather than logging a change that never landed.
async function loadContactAuditContext(orgId: string, dealId: string, contactId: string) {
  const [row] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      phone: contacts.phone,
      geography: contacts.geography,
      notes: contacts.notes,
      receivesCommunication: contacts.receivesCommunication,
      builderId: contacts.builderId,
      builderName: builders.name,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(contacts)
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .leftJoin(deals, and(eq(deals.id, dealId), eq(deals.orgId, orgId)))
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

// Deal id + name for entries whose target row carries neither: a freshly
// inserted contact, a new deal_buyer link, or a bulk add whose subject is the
// deal itself. Org-scoped so a forged deal id lands as null rather than as a
// real deal's name.
async function loadDealAuditContext(orgId: string, dealId: string) {
  const [row] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, orgId)))
    .limit(1);
  return row ?? null;
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

  // Audit context read BEFORE the transaction. Neither value depends on
  // anything the transaction produces, and a read placed after the commit
  // could throw once the rows had already landed, which would report a
  // successful add as a failure and undo this action's all-or-nothing
  // property. The entries themselves are still written after the commit.
  const user = await getCurrentUser();
  const deal = await loadDealAuditContext(org.id, input.dealId);

  const outcome = await db.transaction(async (tx) => {
    let builderId: string | null = input.builderId ?? null;
    // Audit context, collected as we go. Adding one person can also create a
    // builder in the org roster and put it on the deal, and the entries below
    // are the only place either side effect surfaces. The created builder row
    // and the new deal_buyers id ride out of the transaction rather than being
    // logged inside it: a rolled-back insert must never leave an entry behind.
    let builderName: string | null = null;
    let builderCreated = false;
    let builderAttachedToDeal = false;
    let createdBuilder: typeof builders.$inferSelect | null = null;
    let dealBuyerId: string | null = null;

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
        builderName = existing.name;
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
        builderName = builder.name;
        builderCreated = true;
        createdBuilder = builder;
      }
      const [existingLink] = await tx
        .select({ id: dealBuyers.id })
        .from(dealBuyers)
        .where(
          and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.builderId, resolvedBuilderId)),
        )
        .limit(1);
      if (!existingLink) {
        const [link] = await tx
          .insert(dealBuyers)
          .values({
            orgId: org.id,
            dealId: input.dealId,
            builderId: resolvedBuilderId,
            tier: "not_selected",
          })
          .returning();
        dealBuyerId = link.id;
        builderAttachedToDeal = true;
      }
      builderId = resolvedBuilderId;
    } else if (builderId) {
      // Existing builder must belong to this org. We no longer require it
      // to be already on the deal — if it isn't, attach it now (idempotent
      // via the existing-link check) so the contact has a builder card to
      // appear under. Its name comes back on the same check so the audit
      // entry can say which company without a second round-trip.
      const [b] = await tx
        .select({ id: builders.id, name: builders.name })
        .from(builders)
        .where(and(eq(builders.id, builderId), eq(builders.orgId, org.id)))
        .limit(1);
      if (!b) throw new Error("Builder not found");
      builderName = b.name;

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
        const [link] = await tx
          .insert(dealBuyers)
          .values({
            orgId: org.id,
            dealId: input.dealId,
            builderId,
            tier: "not_selected",
          })
          .returning();
        dealBuyerId = link.id;
        builderAttachedToDeal = true;
      }
    }
    // builderId may still be null here, and that is intentional: the contact lands
    // in the Unaffiliated card.

    const [created] = await tx
      .insert(contacts)
      .values({
        orgId: org.id,
        builderId,
        firstName,
        lastName,
        title: input.title?.trim() || null,
        email: parseEmailAddress(input.email),
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

    return {
      contact: created,
      builderId,
      builderName,
      builderCreated,
      builderAttachedToDeal,
      createdBuilder,
      dealBuyerId,
    };
  });

  // Logged after the transaction commits so the entries only claim what
  // actually landed. writeAudit uses `db`, not `tx`, so it could not join the
  // transaction anyway.
  //
  // Same entry the /builders form and the contact importer write. The Add
  // Contact form is a third way into the org roster, so without this a company
  // could enter the directory with no entry carrying its id at all.
  if (outcome.createdBuilder) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "builder.created",
      entityType: "builder",
      entityId: outcome.createdBuilder.id,
      after: {
        name: truncateForAudit(outcome.createdBuilder.name),
        classification: outcome.createdBuilder.classification,
        notes: truncateForAudit(outcome.createdBuilder.notes),
      },
      metadata: {
        dealId: deal?.id ?? null,
        dealName: deal?.name ?? null,
        label: truncateForAudit(outcome.createdBuilder.name),
        // Sub-variant of the same action: the builder appeared as a side
        // effect of a deal-page form rather than being added deliberately
        // from the org directory.
        createdVia: "deal_page",
      },
    });
  }

  // Same mutation attachBuilderToDeal performs, so it gets the same action
  // rather than living on as a boolean on the contact entry. Otherwise
  // filtering the viewer by deal_buyer misses every builder that arrived on a
  // deal through this form.
  if (outcome.dealBuyerId) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_buyer.attached",
      entityType: "deal_buyer",
      entityId: outcome.dealBuyerId,
      after: { tier: "not_selected" },
      metadata: {
        dealId: deal?.id ?? null,
        dealName: deal?.name ?? null,
        label: builderLabel(outcome.builderName),
        builderId: outcome.builderId,
      },
    });
  }

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "contact.created",
    entityType: "contact",
    entityId: outcome.contact.id,
    after: contactSnapshot(outcome.contact),
    metadata: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      label: contactLabel(outcome.contact.firstName, outcome.contact.lastName),
      builderId: outcome.builderId,
      builderName: truncateForAudit(outcome.builderName),
      // Both side effects now write their own entries (builder.created and
      // deal_buyer.attached above). The flags stay so a reader landing on the
      // contact entry can tell they happened and go look for them.
      builderCreated: outcome.builderCreated,
      builderAttachedToDeal: outcome.builderAttachedToDeal,
    },
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
    email: parseEmailAddress(input.email),
    phone: formatPhone(input.phone),
    notes: input.notes?.trim() || null,
  };
  if (input.receivesCommunication !== undefined) {
    update.receivesCommunication = input.receivesCommunication;
  }

  const user = await getCurrentUser();
  const before = await loadContactAuditContext(org.id, input.dealId, input.contactId);

  await db
    .update(contacts)
    .set(update)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  // The edit modal re-submits every field on every save, so most saves move
  // nothing. Log only when something actually did, and name the fields that
  // moved so the reader doesn't have to diff the snapshot by eye. Comparison
  // is on the raw values, before truncateForAudit, so an edit past the 500th
  // character of a note still registers as a change.
  const changedFields: string[] = [];
  if (before) {
    for (const key of Object.keys(update) as (keyof typeof update)[]) {
      if (before[key] !== update[key]) changedFields.push(key);
    }
  }

  if (before && changedFields.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "contact.updated",
      entityType: "contact",
      entityId: input.contactId,
      before: contactSnapshot(before),
      after: contactSnapshot({ ...before, ...update }),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: contactLabel(firstName, lastName),
        builderName: truncateForAudit(before.builderName),
        changedFields,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteContact(input: { dealId: string; contactId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Snapshot before the row goes: afterwards this entry is the only surviving
  // record of who the person was. The button sits on one deal, but the contact
  // is org-level, so the delete takes them off every deal they were on:
  // deal_contacts cascades on the contact FK. Those deals are captured here
  // because they vanish silently otherwise.
  const before = await loadContactAuditContext(org.id, input.dealId, input.contactId);
  const removedFromDeals = before
    ? await db
        .select({ dealId: dealContacts.dealId, dealName: deals.name })
        .from(dealContacts)
        .innerJoin(deals, eq(deals.id, dealContacts.dealId))
        .where(
          and(eq(dealContacts.contactId, input.contactId), eq(dealContacts.orgId, org.id)),
        )
    : [];

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "contact.deleted",
      entityType: "contact",
      entityId: input.contactId,
      before: contactSnapshot(before),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: contactLabel(before.firstName, before.lastName),
        builderName: truncateForAudit(before.builderName),
        // deals.name is an uncapped text column, and the list grows with every
        // deal the person was on, so it gets the same cap and count treatment
        // the bulk entries use.
        removedFromDealsCount: removedFromDeals.length,
        removedFromDeals: removedFromDeals.slice(0, MAX_LOGGED_AUDIT_IDS).map((d) => ({
          dealId: d.dealId,
          dealName: truncateForAudit(d.dealName),
        })),
        removedFromDealsTruncated: removedFromDeals.length > MAX_LOGGED_AUDIT_IDS,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

// A Q&A row's human name is its question, which is unbounded free text and is
// empty on a freshly added row. Capped hard for the viewer's label column; the
// full (500-character capped) text still rides in the before/after snapshot.
function qaLabel(question: string | null | undefined): string {
  const trimmed = (question ?? "").trim();
  if (!trimmed) return "(blank question)";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

// The Q&A fields worth keeping in a before/after snapshot. Both are uncapped
// free text, so both go through truncateForAudit before they reach jsonb.
function qaSnapshot(row: { question: string | null; answer: string | null }) {
  return {
    question: truncateForAudit(row.question),
    answer: truncateForAudit(row.answer),
  };
}

// Pre-mutation snapshot for the Q&A actions below. All of them are otherwise
// blind (`db.update` / `db.delete` with no prior read), and the delete destroys
// the only copy of the text. The join to deals costs nothing extra and buys the
// deal name denormalized into the entry plus the deal id from the database
// rather than from client-supplied `input.dealId`.
//
// Returns null when the item does not exist or belongs to another org, which is
// exactly when the caller's own org-scoped write no-ops. Callers skip the audit
// entry in that case rather than logging a change that never landed.
async function loadQaItemAuditContext(orgId: string, qaId: string) {
  const [row] = await db
    .select({
      question: qaItems.question,
      answer: qaItems.answer,
      approved: qaItems.approved,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(qaItems)
    .innerJoin(deals, eq(deals.id, qaItems.dealId))
    .where(and(eq(qaItems.id, qaId), eq(qaItems.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function addQaItem(input: { dealId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  // Read before the insert: it depends on nothing the insert produces, and a
  // read placed after it could throw with the row already created, reporting a
  // successful add as a failure.
  const deal = await loadDealAuditContext(org.id, input.dealId);

  const [created] = await db
    .insert(qaItems)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      question: "",
      answer: "",
    })
    .returning();

  // The row is created blank and the text is typed into it afterwards, so
  // there is nothing to snapshot beyond its existence: the paired
  // qa_item.updated entry carries the question and answer.
  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "qa_item.created",
    entityType: "qa_item",
    entityId: created.id,
    metadata: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      label: qaLabel(created.question),
    },
  });

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

  const user = await getCurrentUser();
  const before = await loadQaItemAuditContext(org.id, input.qaId);

  await db
    .update(qaItems)
    .set({ question: input.question, answer: input.answer })
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  // The editor re-submits both fields on every save, so most saves move
  // nothing. Log only when something did, and name the field that moved.
  // Comparison is on the raw values, before truncateForAudit, so an edit past
  // the 500th character still registers. A row added blank holds "" where an
  // older row can hold NULL in answer, and the two mean the same thing here.
  const changedFields: string[] = [];
  if (before) {
    if (before.question !== input.question) changedFields.push("question");
    if ((before.answer ?? "") !== input.answer) changedFields.push("answer");
  }

  if (before && changedFields.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "qa_item.updated",
      entityType: "qa_item",
      entityId: input.qaId,
      before: qaSnapshot(before),
      after: qaSnapshot({ question: input.question, answer: input.answer }),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: qaLabel(input.question || before.question),
        changedFields,
      },
    });
  }

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
  const before = await loadQaItemAuditContext(org.id, input.qaId);

  await db
    .update(qaItems)
    .set({
      approved: input.approved,
      approvedAt: input.approved ? new Date() : null,
      approvedBy: input.approved ? (user?.id ?? null) : null,
    })
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  // Approval is what admits a question into the Q&A file that goes out to
  // buyers, so each direction gets its own row in the viewer's Action filter.
  // approved_by already records who approved; this records the un-approvals
  // too, which that column cannot.
  if (before && before.approved !== input.approved) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: input.approved ? "qa_item.approved" : "qa_item.unapproved",
      entityType: "qa_item",
      entityId: input.qaId,
      before: { approved: before.approved },
      after: { approved: input.approved },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: qaLabel(before.question),
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteQaItem(input: { dealId: string; qaId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Snapshot before the row goes: afterwards this entry is the only surviving
  // record of the question and the answer that was drafted for it.
  const before = await loadQaItemAuditContext(org.id, input.qaId);

  await db
    .delete(qaItems)
    .where(and(eq(qaItems.id, input.qaId), eq(qaItems.orgId, org.id)));

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "qa_item.deleted",
      entityType: "qa_item",
      entityId: input.qaId,
      before: { ...qaSnapshot(before), approved: before.approved },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: qaLabel(before.question),
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

// Validate that an assigneeTeamMemberId belongs to the same deal + org
// context as the issue being written. Without this, a caller can pass a
// dtm.id from a foreign deal or another org and the FK layer alone will
// accept it (deal_team_members.id is globally unique). Read paths would
// then leak the foreign member's display name into the picker + PDF.
async function assertAssigneeInDealScope(
  dtmId: string,
  dealId: string,
  orgId: string,
): Promise<void> {
  const [match] = await db
    .select({ id: dealTeamMembers.id })
    .from(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.id, dtmId),
        eq(dealTeamMembers.dealId, dealId),
        eq(dealTeamMembers.orgId, orgId),
      ),
    )
    .limit(1);
  if (!match) throw new Error("Invalid assignee");
}

// An issue's human name is its title, which is uncapped free text and can be
// a pasted paragraph. Capped hard for the viewer's label column, mirroring
// qaLabel; the full (500-character capped) title still rides in the snapshot.
function issueLabel(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return "(untitled issue)";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

// The issue fields worth keeping in a before/after snapshot. title and
// description are both uncapped free text, so both go through
// truncateForAudit before they reach jsonb. The assignee is kept as its
// deal_team_members id: the display name
// lives behind the polymorphic Deal Team identity chain (user, contact, or
// free text), and the issue title in `metadata.label` already names the row.
// resolvedAt is derived from status, so it adds nothing the status does not.
function issueSnapshot(row: {
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeTeamMemberId: string | null;
  identifiedAt: Date | null;
}) {
  return {
    title: truncateForAudit(row.title),
    description: truncateForAudit(row.description),
    status: row.status,
    priority: row.priority,
    assigneeTeamMemberId: row.assigneeTeamMemberId,
    identifiedAt: row.identifiedAt,
  };
}

// Pre-mutation snapshot for the issue actions below. Same shape and same
// reasoning as loadQaItemAuditContext: the updates are blind, the delete
// destroys the record, and the join to deals denormalizes the deal name while
// yielding the deal id from the database rather than from the client.
async function loadIssueAuditContext(orgId: string, issueId: string) {
  const [row] = await db
    .select({
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      assigneeTeamMemberId: issues.assigneeTeamMemberId,
      identifiedAt: issues.identifiedAt,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(issues)
    .innerJoin(deals, eq(deals.id, issues.dealId))
    .where(and(eq(issues.id, issueId), eq(issues.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function addIssue(input: {
  dealId: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeTeamMemberId?: string | null;
  identifiedAt?: Date | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const title = input.title.trim();
  if (!title) throw new Error("Issue title is required");

  if (input.assigneeTeamMemberId) {
    await assertAssigneeInDealScope(input.assigneeTeamMemberId, input.dealId, org.id);
  }

  const user = await getCurrentUser();
  // Read before the insert: it depends on nothing the insert produces, and a
  // read placed after it could throw with the row already created, reporting a
  // successful add as a failure.
  const deal = await loadDealAuditContext(org.id, input.dealId);

  // .returning() so the audit entry can point at the row it created. The
  // stored row is also what gets snapshotted, so defaulted columns
  // (identifiedAt when the caller passed none) are recorded as they landed.
  const [created] = await db
    .insert(issues)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      title,
      description: input.description?.trim() || null,
      status: input.status,
      priority: input.priority,
      assigneeTeamMemberId: input.assigneeTeamMemberId ?? null,
      identifiedAt: input.identifiedAt ?? new Date(),
    })
    .returning();

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "issue.created",
    entityType: "issue",
    entityId: created.id,
    after: issueSnapshot(created),
    metadata: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      label: issueLabel(created.title),
    },
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
  assigneeTeamMemberId?: string | null;
  identifiedAt?: Date | null;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const title = input.title.trim();
  if (!title) throw new Error("Issue title is required");

  if (input.assigneeTeamMemberId) {
    await assertAssigneeInDealScope(input.assigneeTeamMemberId, input.dealId, org.id);
  }

  const wasResolved = input.status === "resolved";

  const user = await getCurrentUser();
  const before = await loadIssueAuditContext(org.id, input.issueId);

  await db
    .update(issues)
    .set({
      title,
      description: input.description?.trim() || null,
      status: input.status,
      priority: input.priority,
      assigneeTeamMemberId: input.assigneeTeamMemberId ?? null,
      identifiedAt: input.identifiedAt ?? undefined,
      resolvedAt: wasResolved ? new Date() : null,
    })
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  // The edit modal re-submits every field on every save, so most saves move
  // nothing. Log only when something did, and name the fields that moved so
  // the reader doesn't have to diff the snapshot by eye.
  const after = {
    title,
    description: input.description?.trim() || null,
    status: input.status,
    priority: input.priority,
    assigneeTeamMemberId: input.assigneeTeamMemberId ?? null,
    // undefined above means "leave the stored value alone", so the entry
    // reports the value that is still on the row.
    identifiedAt: input.identifiedAt ?? before?.identifiedAt ?? null,
  };

  const changedFields: string[] = [];
  if (before) {
    if (before.title !== after.title) changedFields.push("title");
    if (before.description !== after.description) changedFields.push("description");
    if (before.status !== after.status) changedFields.push("status");
    if (before.priority !== after.priority) changedFields.push("priority");
    if (before.assigneeTeamMemberId !== after.assigneeTeamMemberId) {
      changedFields.push("assigneeTeamMemberId");
    }
    // Day granularity, because that is all the edit modal can move: it hands
    // the picker `identifiedAt.slice(0, 10)` and parses the result back as UTC
    // midnight, so any row stored at another time of day (seeded, or created
    // before the picker existed) would otherwise report a phantom edit the
    // first time it is opened and saved.
    const beforeDay = before.identifiedAt.toISOString().slice(0, 10);
    const afterDay = after.identifiedAt?.toISOString().slice(0, 10) ?? null;
    if (beforeDay !== afterDay) {
      changedFields.push("identifiedAt");
    }
  }

  if (before && changedFields.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "issue.updated",
      entityType: "issue",
      entityId: input.issueId,
      before: issueSnapshot(before),
      after: issueSnapshot(after),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: issueLabel(title),
        changedFields,
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function setIssueStatus(input: {
  dealId: string;
  issueId: string;
  status: IssueStatus;
}) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadIssueAuditContext(org.id, input.issueId);

  await db
    .update(issues)
    .set({
      status: input.status,
      resolvedAt: input.status === "resolved" ? new Date() : null,
    })
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  // The status dropdown can re-send the value it already holds, and an issue
  // marked resolved twice is not a change worth a row.
  if (before && before.status !== input.status) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "issue.status_changed",
      entityType: "issue",
      entityId: input.issueId,
      before: { status: before.status },
      after: { status: input.status },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: issueLabel(before.title),
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteIssue(input: { dealId: string; issueId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Snapshot before the row goes: the issues tracker is a living document the
  // buyer and ownership both read through the DD Tracking PDF, so afterwards
  // this entry is the only surviving record that the issue ever existed.
  const before = await loadIssueAuditContext(org.id, input.issueId);

  await db
    .delete(issues)
    .where(and(eq(issues.id, input.issueId), eq(issues.orgId, org.id)));

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "issue.deleted",
      entityType: "issue",
      entityId: input.issueId,
      before: issueSnapshot(before),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: issueLabel(before.title),
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function approveAllQaItems(input: { dealId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();
  // Read before the update: it depends on nothing the update produces, and a
  // read placed after it could throw with the approvals already committed,
  // reporting a successful mass approval as a failure.
  const deal = await loadDealAuditContext(org.id, input.dealId);

  // .returning() names exactly the rows this call flipped, without a second
  // read that a concurrent approval could race.
  const approved = await db
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
    )
    .returning();

  // Bulk action: there is no single target row, so entityId stays null and the
  // affected ids ride in metadata. Putting the deal's uuid here would hand a
  // reader an id chipped "qa_item" that matches no row in qa_items. Nothing
  // pending means nothing changed, and an entry claiming a mass approval of
  // zero items is noise.
  if (approved.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "qa_item.bulk_approved",
      entityType: "qa_item",
      entityId: null,
      metadata: {
        dealId: deal?.id ?? null,
        dealName: deal?.name ?? null,
        // No single row to name, and the viewer already gives the deal its own
        // column, so a label here would just read as the deal name twice.
        label: null,
        // `count` is the true total; the two lists below are capped, so the
        // flag says plainly when they stop short of it.
        count: approved.length,
        qaItemIds: approved.slice(0, MAX_LOGGED_AUDIT_IDS).map((r) => r.id),
        questions: approved.slice(0, MAX_LOGGED_AUDIT_IDS).map((r) => qaLabel(r.question)),
        qaItemsTruncated: approved.length > MAX_LOGGED_AUDIT_IDS,
      },
    });
  }

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

// Pre-mutation snapshot for the consultant actions below, and for the roster
// half of savePsaAttorneyDecision. Same reasoning as loadIssueAuditContext:
// the update is blind, the delete destroys the row outright, and the join to
// deals denormalizes the deal name while yielding the deal id from the
// database rather than from the client.
//
// Scoped by deal as well as org, matching the where clause on the writes
// themselves, so the snapshot describes exactly the row the caller can touch.
// Returns null when there is no such row, which is exactly when the caller's
// own write no-ops. Callers skip the audit entry rather than logging a change
// that never landed.
async function loadConsultantAuditContext(
  orgId: string,
  dealId: string,
  consultantId: string,
) {
  const [row] = await db
    .select({
      role: consultants.role,
      side: consultants.side,
      firmName: consultants.firmName,
      contactName: consultants.contactName,
      contactEmail: consultants.contactEmail,
      contactPhone: consultants.contactPhone,
      notes: consultants.notes,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(consultants)
    .innerJoin(deals, eq(deals.id, consultants.dealId))
    .where(
      and(
        eq(consultants.id, consultantId),
        eq(consultants.dealId, dealId),
        eq(consultants.orgId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// The consultant columns worth keeping in a before/after snapshot, as they sit
// on the row. Kept as a named type so the no-op diff below can run on these
// raw values while only the snapshot is truncated.
type ConsultantAuditRow = {
  role: ConsultantRole;
  side: ConsultantSide;
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
};

const CONSULTANT_AUDIT_FIELDS = [
  "role",
  "side",
  "firmName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "notes",
] as const;

// Every string column here is uncapped free text, so all of them go through
// truncateForAudit before they reach jsonb. role and side stay as the stored
// enum values; their display wording (Civil Engineer, Buyer / Seller) is the
// viewer's business.
function consultantSnapshot(row: ConsultantAuditRow) {
  return {
    role: row.role,
    side: row.side,
    firmName: truncateForAudit(row.firmName),
    contactName: truncateForAudit(row.contactName),
    contactEmail: truncateForAudit(row.contactEmail),
    contactPhone: truncateForAudit(row.contactPhone),
    notes: truncateForAudit(row.notes),
  };
}

// Both edit surfaces (the Consultants tab modal and the Phase 1 PSA Attorney
// row) re-submit every field on every save, so most saves move nothing. Name
// the fields that moved so the reader doesn't have to diff the snapshot by
// eye, and let the caller skip the write when the list comes back empty.
//
// Compares the raw rows, never the snapshots: truncateForAudit caps notes at
// 500 characters, so a diff of two snapshots would call an edit past that
// boundary no change at all and the mutation would land with no entry.
function consultantChangedFields(
  before: ConsultantAuditRow,
  after: ConsultantAuditRow,
): string[] {
  return CONSULTANT_AUDIT_FIELDS.filter((field) => before[field] !== after[field]);
}

// "Ware Malcomb (Architect)". firmName alone doesn't say what the row is, and
// a roster entry has to be legible in the viewer's list without expanding it.
// firmName is uncapped, so the label is capped the way qaLabel caps a question.
function consultantLabel(row: { firmName: string; role: ConsultantRole }): string {
  const firm = row.firmName.length > 80 ? `${row.firmName.slice(0, 80)}…` : row.firmName;
  return `${firm} (${CONSULTANT_ROLE_LABEL[row.role] ?? row.role})`;
}

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

  const user = await getCurrentUser();
  // Read before the insert: it depends on nothing the insert produces, and a
  // read placed after it could throw with the row already created, reporting a
  // successful add as a failure.
  const deal = await loadDealAuditContext(org.id, input.dealId);

  // .returning() so the audit entry can point at the row it created, and so
  // the snapshot records the values as they actually landed (the email and
  // phone are rewritten on the way in by parseEmailAddress / formatPhone).
  const [created] = await db
    .insert(consultants)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      role: input.role,
      side: input.side,
      firmName,
      contactName: input.contactName?.trim() || null,
      contactEmail: parseEmailAddress(input.contactEmail),
      contactPhone: formatPhone(input.contactPhone),
      notes: input.notes?.trim() || null,
    })
    .returning();

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "consultant.created",
    entityType: "consultant",
    entityId: created.id,
    after: consultantSnapshot(created),
    metadata: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      label: consultantLabel(created),
    },
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

  const user = await getCurrentUser();
  const before = await loadConsultantAuditContext(
    org.id,
    input.dealId,
    input.consultantId,
  );

  await db
    .update(consultants)
    .set({
      role: input.role,
      side: input.side,
      firmName,
      contactName: input.contactName?.trim() || null,
      // Was a bare trim while addConsultant already parsed, so an edit
      // could store an address the insert path would have rejected.
      // Consultants are now email recipients (unified Deal Team CC), and
      // a malformed address fails the whole outbound message at Resend.
      contactEmail: parseEmailAddress(input.contactEmail),
      contactPhone: formatPhone(input.contactPhone),
      notes: input.notes?.trim() || null,
    })
    .where(
      and(
        eq(consultants.id, input.consultantId),
        // Deal-scoped as well as org-scoped. Every sibling query in this
        // file scopes by deal; these two did not, which was harmless
        // while the only caller passed an id it had just read off the
        // same deal, and stops being harmless now the Phase 1 checklist
        // row is a second caller.
        eq(consultants.dealId, input.dealId),
        eq(consultants.orgId, org.id),
      ),
    );

  if (before) {
    const afterRow = {
      role: input.role,
      side: input.side,
      firmName,
      contactName: input.contactName?.trim() || null,
      contactEmail: parseEmailAddress(input.contactEmail),
      contactPhone: formatPhone(input.contactPhone),
      notes: input.notes?.trim() || null,
    };
    // Diff the raw rows, snapshot only for the payload.
    const changedFields = consultantChangedFields(before, afterRow);
    const beforeSnapshot = consultantSnapshot(before);
    const afterSnapshot = consultantSnapshot(afterRow);
    if (changedFields.length > 0) {
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "consultant.updated",
        entityType: "consultant",
        entityId: input.consultantId,
        before: beforeSnapshot,
        after: afterSnapshot,
        metadata: {
          dealId: before.dealId,
          dealName: before.dealName,
          label: consultantLabel({ firmName, role: input.role }),
          changedFields,
        },
      });
    }
  }

  revalidatePath(`/deals/${input.dealId}`);
}

export async function deleteConsultant(input: { dealId: string; consultantId: string }) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Snapshot before the row goes. The roster is the only place the platform
  // holds a consultant's firm, side and contact details, and the Phase 4
  // kickoff email addresses people out of it, so afterwards this entry is the
  // only surviving record that the row ever existed.
  const before = await loadConsultantAuditContext(
    org.id,
    input.dealId,
    input.consultantId,
  );

  await db
    .delete(consultants)
    .where(
      and(
        eq(consultants.id, input.consultantId),
        // Deal-scoped as well as org-scoped. Every sibling query in this
        // file scopes by deal; these two did not, which was harmless
        // while the only caller passed an id it had just read off the
        // same deal, and stops being harmless now the Phase 1 checklist
        // row is a second caller.
        eq(consultants.dealId, input.dealId),
        eq(consultants.orgId, org.id),
      ),
    );

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "consultant.deleted",
      entityType: "consultant",
      entityId: input.consultantId,
      before: consultantSnapshot(before),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: consultantLabel(before),
      },
    });
  }

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

  // Audit context read BEFORE the transaction. Neither value depends on
  // anything the transaction produces, and a read placed after the commit
  // could throw once the rows had already landed, which would report a
  // successful add as a failure and undo this action's all-or-nothing
  // property. The entries themselves are still written after the commit.
  const user = await getCurrentUser();
  const deal = await loadDealAuditContext(org.id, input.dealId);

  // Single transaction so we don't end up with an orphan builder if the
  // deal_buyer insert fails.
  const result = await db.transaction(async (tx) => {
    // Find-or-create on the builder so we don't double-insert a builder
    // that already exists in the org under the same (normalized) name.
    // Then attach to the deal idempotently — the reused builder might
    // already be on this deal.
    const existing = await findBuilderByName(tx, org.id, name);
    let builderId: string;
    // Stored name, not the typed one: a reused builder keeps whatever casing
    // and spacing the org already has on file.
    let builderName: string;
    let builderCreated = false;
    // Carried out of the transaction so the builder.created entry is written
    // only once the insert has actually committed.
    let createdBuilder: typeof builders.$inferSelect | null = null;
    if (existing) {
      builderId = existing.id;
      builderName = existing.name;
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
      builderName = builder.name;
      builderCreated = true;
      createdBuilder = builder;
    }

    const [existingLink] = await tx
      .select({ id: dealBuyers.id })
      .from(dealBuyers)
      .where(and(eq(dealBuyers.dealId, input.dealId), eq(dealBuyers.builderId, builderId)))
      .limit(1);
    let dealBuyerId: string;
    let linkCreated = false;
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
      linkCreated = true;
    }

    return { builderId, dealBuyerId, builderName, builderCreated, linkCreated, createdBuilder };
  });

  // Both branches above are idempotent, so re-submitting the form for a
  // builder already on the deal changes nothing and gets no entry. A builder
  // created but already linked is impossible, so in practice linkCreated is
  // the whole test; createdBuilder is checked on its own anyway so the roster
  // entry can never depend on the link one.
  if (result.linkCreated || result.createdBuilder) {
    // Same entry the /builders form and the contact importer write, so the
    // builder history is complete whichever route created the row.
    if (result.createdBuilder) {
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "builder.created",
        entityType: "builder",
        entityId: result.createdBuilder.id,
        after: {
          name: truncateForAudit(result.createdBuilder.name),
          classification: result.createdBuilder.classification,
          notes: truncateForAudit(result.createdBuilder.notes),
        },
        metadata: {
          dealId: deal?.id ?? null,
          dealName: deal?.name ?? null,
          label: truncateForAudit(result.createdBuilder.name),
          createdVia: "deal_page",
        },
      });
    }

    if (result.linkCreated) {
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "deal_buyer.added",
        entityType: "deal_buyer",
        entityId: result.dealBuyerId,
        after: {
          tier: input.tier ?? "not_selected",
          classification: input.classification,
        },
        metadata: {
          dealId: deal?.id ?? null,
          dealName: deal?.name ?? null,
          label: builderLabel(result.builderName),
          builderId: result.builderId,
          // The Add Buyer form mints the company when the typed name is new.
          // The flag stays for correlation with the builder.created entry
          // written just above.
          builderCreated: result.builderCreated,
        },
      });
    }
  }

  revalidatePath(`/deals/${input.dealId}`);
  // Rebuilt key by key rather than returning `result` whole: the extra keys
  // on it are audit context, and the client keeps receiving exactly the shape
  // the signature promises.
  return { builderId: result.builderId, dealBuyerId: result.dealBuyerId };
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

  // Confirm builder belongs to this org. Name comes back on the same query so
  // the audit entry below can say which company without a second round-trip.
  const [b] = await db
    .select({ id: builders.id, name: builders.name })
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

  // Read before the insert, and after the early return above so the no-op path
  // still costs nothing: the deal context depends on nothing the insert
  // produces, and a read placed after it could throw with the row already
  // attached, reporting a successful attach as a failure.
  const user = await getCurrentUser();
  const deal = await loadDealAuditContext(org.id, input.dealId);

  const [created] = await db
    .insert(dealBuyers)
    .values({
      orgId: org.id,
      dealId: input.dealId,
      builderId: input.builderId,
      tier: "not_selected",
    })
    .returning();

  // A separate action from deal_buyer.added on purpose: nobody chose to put
  // this builder on the deal. The Add Existing Contact flow brought it along
  // so the picked contact had a card to appear under, and a reader asking why
  // a company showed up on a deal needs to be able to tell the two apart. The
  // already-on-deal path returns above without an entry: nothing changed.
  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "deal_buyer.attached",
    entityType: "deal_buyer",
    entityId: created.id,
    after: { tier: "not_selected" },
    metadata: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      label: builderLabel(b.name),
      builderId: input.builderId,
    },
  });

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
  // Names ride along on the existing lookup so the audit entry can list who
  // was added rather than thirty UUIDs.
  const rows = await db
    .select({
      id: contacts.id,
      builderId: contacts.builderId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
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
  // Which contacts the insert actually landed, for the audit entry. Not the
  // same as input.contactIds: the ones already on the deal conflict away.
  let addedContactIds: string[] = [];

  // Audit context read BEFORE the transaction. Neither value depends on
  // anything the transaction produces, and a read placed after the commit
  // could throw once the rows had already landed, which would report a
  // successful bulk add as a failure and undo this action's all-or-nothing
  // property. The entries themselves are still written after the commit.
  const user = await getCurrentUser();
  const deal = await loadDealAuditContext(org.id, input.dealId);
  const nameById = new Map(
    rows.map((r): [string, string] => [r.id, contactLabel(r.firstName, r.lastName)]),
  );

  // Identities behind the counters above. Returned from the transaction rather
  // than written from inside it, so nothing is logged that a rollback undid.
  // Counts alone cannot answer the questions this action raises: which company
  // was minted, which builders went onto the deal, and above all which people
  // were moved to a different company. Re-pointing contacts.builder_id is a
  // permanent org-wide change to who a person works for, and "5 contacts
  // repointed" cannot undo or even identify it.
  const identities = await db.transaction(async (tx) => {
    let standaloneBuilderId: string | null = null;
    let standaloneBuilderName: string | null = null;
    let createdStandaloneBuilder: typeof builders.$inferSelect | null = null;
    const attachedBuilderIds: string[] = [];
    let repointedContacts: { id: string; name: string; builderId: string | null }[] = [];

    // Step 1: resolve the standalone target builder (creating it if needed)
    // and ensure it's attached to the deal. Skipped entirely when no target
    // was picked — standalones stay standalone.
    if (input.standaloneTarget) {
      if (input.standaloneTarget.type === "new") {
        const name = input.standaloneTarget.name.trim();
        const existing = await findBuilderByName(tx, org.id, name);
        if (existing) {
          standaloneBuilderId = existing.id;
          standaloneBuilderName = existing.name;
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
          standaloneBuilderName = b.name;
          createdStandaloneBuilder = b;
          buildersCreated++;
        }
      } else {
        // Name rides along on the org-scope check so the audit entry can say
        // which company the contacts were moved to without a second query.
        const [b] = await tx
          .select({ id: builders.id, name: builders.name })
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
        standaloneBuilderName = b.name;
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
        attachedBuilderIds.push(standaloneBuilderId);
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
        attachedBuilderIds.push(...toAttach);
        buildersAttached += toAttach.length;
      }
    }

    // Step 3: re-point standalone contacts at the resolved builder if one
    // was picked. Skipped when no target — they remain standalones.
    if (standalones.length > 0 && standaloneBuilderId) {
      const ids = standalones.map((r) => r.id);
      await tx.update(contacts).set({ builderId: standaloneBuilderId }).where(inArray(contacts.id, ids));
      contactsRepointed = ids.length;
      // Their previous builderId is null by definition (that is what makes
      // them standalone), but it is recorded rather than assumed so the entry
      // says what the rows held instead of what the filter implies.
      repointedContacts = standalones.map((r) => ({
        id: r.id,
        name: contactLabel(r.firstName, r.lastName),
        builderId: r.builderId,
      }));
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
    addedContactIds = insertResult.map((r) => r.contactId);
    dealContactsAdded = addedContactIds.length;

    return {
      standaloneBuilderId,
      standaloneBuilderName,
      createdStandaloneBuilder,
      attachedBuilderIds,
      repointedContacts,
    };
  });

  // One entry for the whole batch rather than one per contact: thirty rows
  // written in the same second bury the rest of the day's log. A bulk add has
  // no single target row, so entityId stays null rather than holding a deal
  // uuid under a deal_contact chip; the contacts themselves are listed in
  // metadata, and the deal identity in metadata.dealId / dealName.
  //
  // Re-adding contacts already on the deal is a complete no-op (the insert is
  // ON CONFLICT DO NOTHING and every builder step is idempotent), so nothing
  // is logged unless one of the four counters moved.
  const changed =
    dealContactsAdded > 0 ||
    buildersAttached > 0 ||
    buildersCreated > 0 ||
    contactsRepointed > 0;

  if (changed) {
    // Same entry the /builders form and the contact importer write. This flow
    // can mint a company from free-typed text in the middle of a batch, which
    // is the easiest way for a builder to enter the org roster unnoticed.
    const createdBuilder = identities.createdStandaloneBuilder;
    if (createdBuilder) {
      await writeAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "builder.created",
        entityType: "builder",
        entityId: createdBuilder.id,
        after: {
          name: truncateForAudit(createdBuilder.name),
          classification: createdBuilder.classification,
          notes: truncateForAudit(createdBuilder.notes),
        },
        metadata: {
          dealId: deal?.id ?? null,
          dealName: deal?.name ?? null,
          label: truncateForAudit(createdBuilder.name),
          createdVia: "deal_page",
        },
      });
    }

    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_contact.bulk_added",
      entityType: "deal_contact",
      entityId: null,
      // Who moved company, and what they belonged to first. In `before`
      // rather than `metadata` on purpose: the viewer searches the before and
      // after jsonb but not metadata, and this is the one part of a bulk add
      // that is not reversible from the deal.
      before:
        identities.repointedContacts.length > 0
          ? {
              repointedContacts: identities.repointedContacts.slice(0, MAX_LOGGED_AUDIT_IDS),
              repointedContactsTruncated:
                identities.repointedContacts.length > MAX_LOGGED_AUDIT_IDS,
            }
          : undefined,
      metadata: {
        dealId: deal?.id ?? null,
        dealName: deal?.name ?? null,
        // No single row to name, and the viewer already gives the deal its own
        // column, so a label here would just read as the deal name twice.
        label: null,
        // contactsAdded is the true total; the two lists beside it are capped
        // the same way every other list in this entry is, so the flag says
        // plainly when they stop short of it.
        contactsAdded: dealContactsAdded,
        contactIds: addedContactIds.slice(0, MAX_LOGGED_AUDIT_IDS),
        contactNames: addedContactIds
          .slice(0, MAX_LOGGED_AUDIT_IDS)
          .map((id) => nameById.get(id) ?? id),
        contactsTruncated: addedContactIds.length > MAX_LOGGED_AUDIT_IDS,
        buildersAttached,
        buildersCreated,
        contactsRepointed,
        // The three builder-side mutations by identity, not just by count.
        // contactsRepointed counts every standalone in the selection while
        // contactIds lists only the newly inserted deal_contacts rows, so the
        // two numbers describe different sets and neither names a builder.
        standaloneBuilderId: identities.standaloneBuilderId,
        standaloneBuilderName: truncateForAudit(identities.standaloneBuilderName),
        attachedBuilderIds: identities.attachedBuilderIds.slice(0, MAX_LOGGED_AUDIT_IDS),
        attachedBuilderIdsTruncated:
          identities.attachedBuilderIds.length > MAX_LOGGED_AUDIT_IDS,
      },
    });
  }

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

  // Snapshot first: the deal_contacts row is about to go, and afterwards this
  // entry is the only record of who was on the deal. The contact themselves
  // survives (this is an un-assign, not a delete), but nothing else records
  // that they were ever here.
  const user = await getCurrentUser();
  const before = await loadContactAuditContext(org.id, input.dealId, input.contactId);

  // .returning() so a click on a contact who was not on the deal after all is
  // a no-op that logs nothing, rather than an entry claiming a removal that
  // never happened.
  const removed = await db
    .delete(dealContacts)
    .where(
      and(
        eq(dealContacts.dealId, input.dealId),
        eq(dealContacts.contactId, input.contactId),
        eq(dealContacts.orgId, org.id),
      ),
    )
    .returning();

  if (before && removed.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_contact.removed",
      entityType: "deal_contact",
      entityId: input.contactId,
      before: contactSnapshot(before),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: contactLabel(before.firstName, before.lastName),
        // deal_contacts has a composite PK, so entityId is the contact by
        // convention here. Repeating it under a named key (the way the bulk
        // sibling lists contactIds) means the uuid's meaning does not depend
        // on the reader knowing which half of the pair entityId holds.
        contactId: input.contactId,
        builderId: before.builderId,
        builderName: truncateForAudit(before.builderName),
      },
    });
  }

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

  const user = await getCurrentUser();
  const before = await loadContactAuditContext(org.id, input.dealId, input.contactId);

  await db
    .update(contacts)
    .set({ receivesCommunication: input.receivesCommunication })
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  // This flag decides whether a real person receives client-facing mail, and
  // opting out wins over every blast filter, so "why did Lennar's VP stop
  // getting the OM" has to be answerable. Split into two actions so an opt-out
  // reads as one at a glance instead of hiding inside a generic update.
  // The split is NOT a complete filter on its own: the edit modal writes the
  // same column through updateContact, which logs contact.updated with
  // receivesCommunication in changedFields, so answering that question means
  // checking both actions. A toggle re-sent at its current value (double
  // click, stale optimistic render) changes nothing and logs nothing.
  if (before && before.receivesCommunication !== input.receivesCommunication) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: input.receivesCommunication
        ? "contact.communication_enabled"
        : "contact.communication_disabled",
      entityType: "contact",
      entityId: input.contactId,
      before: { receivesCommunication: before.receivesCommunication },
      after: { receivesCommunication: input.receivesCommunication },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: contactLabel(before.firstName, before.lastName),
        builderId: before.builderId,
        builderName: truncateForAudit(before.builderName),
        // Already on the contact row, and it is the address the change is
        // about, so it belongs in an entry about mail delivery. Uncapped
        // column, so it is truncated like the rest.
        contactEmail: truncateForAudit(before.email),
        // The flag is org-wide: this toggles the person out of every blast on
        // every deal, not just the one the toggle was clicked from.
        scope: "all_deals",
      },
    });
  }

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
    .select({
      name: checklistItems.name,
      trackedDate: checklistItems.trackedDate,
      estimatedDate: checklistItems.estimatedDate,
    })
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
  const dueDate = formatOfferingDate(
    offeringDateRow?.trackedDate ?? offeringDateRow?.estimatedDate ?? null,
  );
  // Same query already loaded every checklist item for this deal, so
  // the B&F due date is found inline without another round-trip.
  const bnfRow = offeringDateItems.find((r) => {
    const n = r.name.toLowerCase();
    return n.includes("send out b&f") || n.includes("send out b & f");
  });
  const bnfDueDate = formatOfferingDate(
    bnfRow?.trackedDate ?? bnfRow?.estimatedDate ?? null,
  );

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
      bnfDueDate,
    },
    senderOptions,
    defaultSenderId,
  };
}

// "Friday, May 29, 2026" from a date column's YYYY-MM-DD string. Built
// against a local-time Date so the formatted day matches the date the
// user picked (passing the string straight to new Date() treats it as
// UTC midnight, which can roll back a day in negative-offset zones).
// Thin alias kept so existing call sites read unchanged. The real
// implementation moved to src/lib/format-milestone-date.ts so the
// client-side var resolver in deal-team-preflight.ts can share it —
// a "use server" module can't export a pure function.
function formatOfferingDate(trackedDate: string | null): string {
  return formatMilestoneDate(trackedDate);
}

// Standalone lookup for the deal's Offering Date tracked-date. Returns
// the raw YYYY-MM-DD string or null. Used by the 1-week notice button's
// pre-flight check so we can refuse to open the composer when the
// Offering Date isn't set.
export async function getOfferingDate(input: {
  dealId: string;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  // Throw, don't return null: callers treat null as "the milestone isn't
  // set" and tell the user to go set it. On an expired session that
  // advice is a dead end — the date IS set. Throwing routes it to the
  // caller's catch, which surfaces a transient-failure toast instead.
  if (!org) throw new Error("No organization context");
  const rows = await db
    .select({
      name: checklistItems.name,
      trackedDate: checklistItems.trackedDate,
      estimatedDate: checklistItems.estimatedDate,
    })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const row = rows.find((r) => r.name.toLowerCase().includes("offering date"));
  // Prefer the actual date, fall back to the projection. Before the
  // estimate field existed every one of these rows held a real date in
  // tracked_date, so this preserves current behaviour exactly while
  // letting an email pick up a scheduled date that has not happened yet.
  return row?.trackedDate ?? row?.estimatedDate ?? null;
}

// Sister of getOfferingDate for the B&F due date. Reads the trackedDate
// off the Phase 3 "Send out B&F" row. The B&F button gates the composer
// on this and substitutes the formatted date into the template body.
export async function getBnfDueDate(input: {
  dealId: string;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  // See getOfferingDate: null means "not set", a throw means "couldn't
  // check" — the two need different user-facing copy.
  if (!org) throw new Error("No organization context");
  const rows = await db
    .select({
      name: checklistItems.name,
      trackedDate: checklistItems.trackedDate,
      estimatedDate: checklistItems.estimatedDate,
    })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const row = rows.find((r) => {
    const n = r.name.toLowerCase();
    return n.includes("send out b&f") || n.includes("send out b & f");
  });
  // Prefer the actual date, fall back to the projection. Before the
  // estimate field existed every one of these rows held a real date in
  // tracked_date, so this preserves current behaviour exactly while
  // letting an email pick up a scheduled date that has not happened yet.
  return row?.trackedDate ?? row?.estimatedDate ?? null;
}

// Meeting date for the Phase 3 "Schedule Summary of Offer Review" row.
// Feeds {{reviewDate}} in SCHEDULE_SOO_REVIEW_TEMPLATE. Same shape as
// getBnfDueDate — reads the row's tracked_date milestone.
// Throws (rather than returning null) when there's no org context so
// callers can tell "session expired" apart from "the row has no date".
// A null return means genuinely-unset, which the send buttons surface as
// an actionable "set the date first" instruction.
export async function getSooReviewDate(input: {
  dealId: string;
  // When the caller knows the exact row (the send button passes its own
  // item.id), read that row directly instead of name-matching. Avoids
  // picking the wrong row mid-template-rename, when two matching rows
  // can briefly coexist.
  itemId?: string | null;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const rows = await db
    .select({
      id: checklistItems.id,
      name: checklistItems.name,
      trackedDate: checklistItems.trackedDate,
      estimatedDate: checklistItems.estimatedDate,
    })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );

  const exact = input.itemId ? rows.find((r) => r.id === input.itemId) : undefined;
  const row =
    exact ??
    rows.find((r) => r.name.toLowerCase().includes("schedule summary of offer review"));
  // Prefer the actual date, fall back to the projection. Before the
  // estimate field existed every one of these rows held a real date in
  // tracked_date, so this preserves current behaviour exactly while
  // letting an email pick up a scheduled date that has not happened yet.
  return row?.trackedDate ?? row?.estimatedDate ?? null;
}

// DD folder URL for the Phase 4 Share-DD-Material sends. Feeds
// {{ddFolderUrl}} in SHARE_DD_MATERIAL_TEMPLATE.
//
// Two sources, in priority order:
//   1. A link on the calling row itself (Chris pastes the Dropbox URL
//      right where he's sending from).
//   2. A link on the Phase 1 "Create Full Due Diligence Dropbox Folder"
//      row — the canonical home for the deal's DD folder, set up once
//      during go-to-market prep and reused by every later DD send.
//
// Returns null when neither carries a link, which the caller's
// pre-flight turns into an inline "add a link first" rejection rather
// than opening a composer with a raw {{ddFolderUrl}} in the body.
export async function getDdFolderUrl(input: {
  dealId: string;
  // The row the send is firing from. Checked first.
  itemId?: string | null;
}): Promise<string | null> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // A row can carry several links (title report, survey, recorded map).
  // Only one of them is the DD folder, so prefer links that actually
  // look like a shared folder before falling back to "first link wins".
  // Without this the Index-of-DD-Material row happily emails its index
  // document as "the due diligence folder".
  const looksLikeFolder = (l: { url: string; label: string | null }) => {
    const hay = `${l.label ?? ""} ${l.url}`.toLowerCase();
    return (
      hay.includes("folder") ||
      hay.includes("dropbox") ||
      hay.includes("sharepoint") ||
      hay.includes("drive.google")
    );
  };

  // Source 1: links on the calling row. Joined through checklist_items ->
  // checklist_categories so the row must belong to THIS deal — an itemId
  // from a sibling deal in the same org can't leak its folder URL into a
  // send that reaches the external Buyer Team.
  if (input.itemId) {
    const own = await db
      .select({ url: checklistItemLinks.url, label: checklistItemLinks.label })
      .from(checklistItemLinks)
      .innerJoin(
        checklistItems,
        eq(checklistItems.id, checklistItemLinks.checklistItemId),
      )
      .innerJoin(
        checklistCategories,
        eq(checklistCategories.id, checklistItems.categoryId),
      )
      .where(
        and(
          eq(checklistItemLinks.checklistItemId, input.itemId),
          eq(checklistItemLinks.orgId, org.id),
          eq(checklistCategories.dealId, input.dealId),
        ),
      )
      .orderBy(asc(checklistItemLinks.sortOrder), asc(checklistItemLinks.createdAt));
    const match = own.find(looksLikeFolder);
    if (match?.url) return match.url;
  }

  // Source 2: links on the canonical "Create Full Due Diligence Dropbox
  // Folder" row. Name-matched the same loose way as the other row
  // lookups so a slight template rename doesn't silently break it. The
  // substring is specific enough not to collide with "Create Marketing
  // Dropbox Folder" or "Share Marketing Due Diligence Folder".
  const folderRows = await db
    .select({ id: checklistItems.id, name: checklistItems.name })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(
      and(
        eq(checklistCategories.dealId, input.dealId),
        eq(checklistItems.orgId, org.id),
      ),
    );
  const folderItem = folderRows.find((r) =>
    r.name.toLowerCase().includes("due diligence dropbox folder"),
  );
  if (folderItem) {
    const canonical = await db
      .select({ url: checklistItemLinks.url, label: checklistItemLinks.label })
      .from(checklistItemLinks)
      .where(
        and(
          eq(checklistItemLinks.checklistItemId, folderItem.id),
          eq(checklistItemLinks.orgId, org.id),
        ),
      )
      .orderBy(asc(checklistItemLinks.sortOrder), asc(checklistItemLinks.createdAt));
    // This row's whole purpose is the DD folder, so any link on it is
    // the intended one — folder-looking first, else first available.
    const chosen = canonical.find(looksLikeFolder) ?? canonical[0];
    if (chosen?.url) return chosen.url;
  }

  return null;
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

// Deal-team CC options for a deal. Surfaces every member of the picked
// sub-team that has an email address so the user can CC them on a
// buyer blast without leaving the composer.
//
// IDs use the `${team}:` sentinel prefix (e.g. `owner:`, `broker:`) so
// the BlastModal's persistence layer can tell user-derived CCs (uuid →
// cc_user_ids) apart from deal-team CCs (sentinel → per-send only).
// Deal-team CCs aren't persisted because cc_user_ids is a uuid array;
// persisting them would require a schema change for what's currently a
// low-frequency use case.
export async function getDealTeamCcOptions(input: {
  dealId: string;
  team: "owner" | "broker";
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
        eq(dealTeamMembers.team, input.team),
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
    opts.push({ id: `${input.team}:${r.id}`, name, email });
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

// Pre-mutation context for the five Deal Team actions below.
//
// A member's display name lives on the linked user or contact, not on the team
// row (listDealTeam resolves it exactly this way), so an entry built from the
// row alone would carry a bare UUID for every FK-linked member. The join to
// deals denormalizes dealId / dealName in the same round-trip. Takes a list
// because the batch add resolves every inserted row at once (both callers pass
// a non-empty one; an empty list would come back empty, not error).
async function loadDealTeamMemberAuditContexts(orgId: string, memberIds: string[]) {
  return db
    .select({
      id: dealTeamMembers.id,
      team: dealTeamMembers.team,
      roleLabel: dealTeamMembers.roleLabel,
      notes: dealTeamMembers.notes,
      includeInEmails: dealTeamMembers.includeInEmails,
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      freePhone: dealTeamMembers.phone,
      userName: authUser.name,
      userEmail: authUser.email,
      userPhone: users.phone,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      dealId: dealTeamMembers.dealId,
      dealName: deals.name,
    })
    .from(dealTeamMembers)
    .innerJoin(deals, eq(deals.id, dealTeamMembers.dealId))
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(
      and(inArray(dealTeamMembers.id, memberIds), eq(dealTeamMembers.orgId, orgId)),
    );
}

// Returns null when the row is missing or belongs to another org, which is
// exactly when the caller's org-scoped write would no-op. Callers skip the
// audit entry in that case rather than logging a change that never landed.
async function loadDealTeamMemberAuditContext(orgId: string, memberId: string) {
  const [row] = await loadDealTeamMemberAuditContexts(orgId, [memberId]);
  return row ?? null;
}

type DealTeamMemberAuditContext = Awaited<
  ReturnType<typeof loadDealTeamMemberAuditContexts>
>[number];

// Identity resolution mirrors listDealTeam: user FK wins, then contact FK,
// then the row's own free-text columns. The audit entry needs the resolved
// values because they are what decides whether deal mail reaches this person.
function dealTeamMemberIdentity(row: DealTeamMemberAuditContext) {
  if (row.userId && (row.userName || row.userEmail)) {
    return {
      name: row.userName || row.userEmail || "(unknown)",
      email: row.userEmail,
      phone: row.userPhone,
    };
  }
  if (row.contactId) {
    const fullName = `${row.contactFirst ?? ""} ${row.contactLast ?? ""}`.trim();
    if (fullName) {
      return { name: fullName, email: row.contactEmail, phone: row.contactPhone };
    }
  }
  return { name: row.freeName || "(unknown)", email: row.freeEmail, phone: row.freePhone };
}

// All three identity sources are uncapped text columns, so the resolved name
// is capped for the viewer's label column the way qaLabel caps a question.
// The snapshot still carries the 500-character version of the same name.
function dealTeamMemberLabel(row: DealTeamMemberAuditContext): string {
  const name = dealTeamMemberIdentity(row).name;
  return name.length > 80 ? `${name.slice(0, 80)}…` : name;
}

// Sub-team and role are what decide which deal emails a member receives, so
// they belong in every snapshot alongside the resolved identity. roleLabel,
// the resolved identity fields and notes are all uncapped free text, so they
// go through truncateForAudit on the way to jsonb.
function dealTeamMemberSnapshot(row: DealTeamMemberAuditContext) {
  const identity = dealTeamMemberIdentity(row);
  return {
    team: row.team,
    roleLabel: truncateForAudit(row.roleLabel),
    name: truncateForAudit(identity.name),
    email: truncateForAudit(identity.email),
    phone: truncateForAudit(identity.phone),
    notes: truncateForAudit(row.notes),
    includeInEmails: row.includeInEmails,
  };
}

// The edit modal re-submits every field on every save, so most saves move
// nothing. Compares the raw rows, never the snapshots: truncateForAudit caps
// notes at 500 characters, so a diff of two snapshots would call an edit past
// that boundary no change at all and the mutation would land with no entry.
function dealTeamMemberChangedFields(
  before: DealTeamMemberAuditContext,
  after: DealTeamMemberAuditContext,
): string[] {
  const beforeIdentity = dealTeamMemberIdentity(before);
  const afterIdentity = dealTeamMemberIdentity(after);
  const changed: string[] = [];
  if (before.team !== after.team) changed.push("team");
  if (before.roleLabel !== after.roleLabel) changed.push("roleLabel");
  if (beforeIdentity.name !== afterIdentity.name) changed.push("name");
  if (beforeIdentity.email !== afterIdentity.email) changed.push("email");
  if (beforeIdentity.phone !== afterIdentity.phone) changed.push("phone");
  if (before.notes !== after.notes) changed.push("notes");
  if (before.includeInEmails !== after.includeInEmails) {
    changed.push("includeInEmails");
  }
  return changed;
}

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
              email: parseEmailAddress(m.email),
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

  const inserted = await db
    .insert(dealTeamMembers)
    .values(rows)
    .returning();

  // One entry for the whole batch rather than one per member: the Add
  // Member(s) modal commits a staged list in a single click, and a dozen rows
  // written in the same second bury the rest of the day's log. A batch has no
  // single target row, so entityId stays null rather than holding a deal uuid
  // under a deal_team_member chip; the members themselves are listed in
  // metadata, and the deal identity in metadata.dealId / dealName.
  //
  // Resolved by re-reading the inserted ids rather than from `input`, because
  // a user- or contact-linked member's name lives on the joined record. That
  // read can only happen after the insert, so it goes through auditSafely:
  // resolving a name to label an entry must never turn a committed batch into
  // a reported failure.
  const user = await getCurrentUser();
  await auditSafely(async () => {
    const added = await loadDealTeamMemberAuditContexts(
      org.id,
      inserted.map((r) => r.id),
    );
    if (added.length === 0) return;
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_team_member.bulk_added",
      entityType: "deal_team_member",
      entityId: null,
      after: {
        members: added.slice(0, MAX_LOGGED_AUDIT_IDS).map(dealTeamMemberSnapshot),
        membersTruncated: added.length > MAX_LOGGED_AUDIT_IDS,
      },
      metadata: {
        dealId: added[0].dealId,
        dealName: added[0].dealName,
        // No single row to name, and the viewer already gives the deal its own
        // column, so a label here would just read as the deal name twice.
        label: null,
        // memberCount is the true total; the lists beside it are capped, so
        // the flag says plainly when they stop short of it.
        memberCount: added.length,
        memberIds: added.slice(0, MAX_LOGGED_AUDIT_IDS).map((r) => r.id),
        memberNames: added.slice(0, MAX_LOGGED_AUDIT_IDS).map(dealTeamMemberLabel),
        membersTruncated: added.length > MAX_LOGGED_AUDIT_IDS,
        teams: Array.from(new Set(added.map((r) => r.team))),
      },
    });
  });

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
            email: parseEmailAddress(input.email),
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

  // Resolved after the insert rather than from `input`: for a user- or
  // contact-linked row the display name lives on the joined record, and the
  // deal name has to be denormalized into the entry either way. The read can
  // only happen after the insert, so it goes through auditSafely: resolving a
  // name to label an entry must never turn a committed add into a reported
  // failure.
  const user = await getCurrentUser();
  await auditSafely(async () => {
    const added = await loadDealTeamMemberAuditContext(org.id, created.id);
    if (!added) return;
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_team_member.added",
      entityType: "deal_team_member",
      entityId: created.id,
      after: dealTeamMemberSnapshot(added),
      metadata: {
        dealId: added.dealId,
        dealName: added.dealName,
        label: dealTeamMemberLabel(added),
        team: added.team,
        // Which of the three identity sources the row links to. Free-text rows
        // stay editable in place; FK rows are re-pointed by remove + re-add.
        source: input.source,
      },
    });
  });

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
  // for not silently dropping identity edits on FK rows. The same read
  // doubles as the audit before-snapshot, so it pulls the full context
  // rather than just the two FK columns.
  const user = await getCurrentUser();
  const before = await loadDealTeamMemberAuditContext(org.id, input.memberId);
  if (!before) throw new Error("Team member not found");

  const isFreeText = !before.userId && !before.contactId;
  const updates: Partial<typeof dealTeamMembers.$inferInsert> = {
    roleLabel: input.roleLabel.trim(),
    notes: input.notes?.trim() || null,
  };
  if (isFreeText && input.name !== undefined) {
    updates.name = input.name.trim() || null;
    updates.email = parseEmailAddress(input.email);
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

  // Re-read instead of deriving the after-state from `updates`: identity
  // fields are applied on free-text rows and silently dropped on FK rows, so
  // the only reliable picture of what the row now says is the row itself.
  //
  // Name the fields that moved and skip the entry when none did. The diff runs
  // on the raw rows, so an edit past the 500th character of a note still
  // registers as a change.
  //
  // The re-read can only happen after the update, so it goes through
  // auditSafely: a failed read of the row's new state must not report a saved
  // edit as a failure.
  await auditSafely(async () => {
    const after = await loadDealTeamMemberAuditContext(org.id, input.memberId);
    if (!after) return;
    const changedFields = dealTeamMemberChangedFields(before, after);
    if (changedFields.length === 0) return;
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_team_member.updated",
      entityType: "deal_team_member",
      entityId: input.memberId,
      before: dealTeamMemberSnapshot(before),
      after: dealTeamMemberSnapshot(after),
      metadata: {
        dealId: after.dealId,
        dealName: after.dealName,
        label: dealTeamMemberLabel(after),
        team: after.team,
        changedFields,
      },
    });
  });

  revalidatePath(`/deals/${input.dealId}`);
}

export async function removeDealTeamMember(input: {
  memberId: string;
  dealId: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Snapshot first: the row is about to go, and afterwards this entry is the
  // only record that this person was on the deal, which sub-team they sat on,
  // and whether they were on its email list.
  const user = await getCurrentUser();
  const before = await loadDealTeamMemberAuditContext(org.id, input.memberId);

  // .returning() so a remove that matched nothing (already gone, wrong org) is
  // a no-op that logs nothing, rather than an entry claiming a removal that
  // never happened.
  const removed = await db
    .delete(dealTeamMembers)
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    )
    .returning();

  if (before && removed.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_team_member.removed",
      entityType: "deal_team_member",
      entityId: input.memberId,
      before: dealTeamMemberSnapshot(before),
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: dealTeamMemberLabel(before),
        team: before.team,
      },
    });
  }

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

// ---------------------------------------------------------------------
// Unified Deal Team composer
// ---------------------------------------------------------------------
//
// Backs UnifiedDealTeamSendButton — the "one email, proper To/CC split"
// variant Chris asked for: TO ownership + buyer, CC the brokerage, the
// marketing coordinator, and (optionally) the deal's consultants.
//
// Deliberately a SINGLE action returning the whole composer shape rather
// than new fields threaded through getDealTeamRecipients /
// getOrgCcOptions / getDealTeamCcOptions. Those three are shared with the
// per-sub-team button, the OM blast, and three two-step composers;
// widening them to carry provenance would touch every one of those
// flows. Keeping the unified shape here means reverting this feature is
// deleting a file and swapping two call sites back.
//
// This action is queries only. All shaping lives in
// src/lib/email/unified-deal-team.ts, because "use server" modules may
// only export async functions and so cannot expose a pure helper for a
// verification script to exercise.
export type {
  UnifiedCapLabel,
  UnifiedCcGroup,
  UnifiedCcOption,
  UnifiedDealTeamComposerData,
  UnifiedRecipient,
} from "@/lib/email/unified-deal-team";

export async function getUnifiedDealTeamComposerData(input: {
  dealId: string;
  // When false, consultants are left out of the CC pool entirely. Lets a
  // call site opt into the collapsed To/CC shape without offering
  // consultants (e.g. a send where copying the other side would be
  // wrong).
  includeConsultants?: boolean;
}): Promise<UnifiedDealTeamComposerData> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const includeConsultants = input.includeConsultants ?? true;

  const [teamRows, consultantRows, orgRows] = await Promise.all([
    db
      .select({
        id: dealTeamMembers.id,
        team: dealTeamMembers.team,
        roleLabel: dealTeamMembers.roleLabel,
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
        ),
      )
      .orderBy(
        dealTeamMembers.team,
        dealTeamMembers.sortOrder,
        dealTeamMembers.createdAt,
      ),
    includeConsultants
      ? db
          .select({
            id: consultants.id,
            role: consultants.role,
            side: consultants.side,
            firmName: consultants.firmName,
            contactName: consultants.contactName,
            contactEmail: consultants.contactEmail,
          })
          .from(consultants)
          .where(
            and(
              eq(consultants.dealId, input.dealId),
              eq(consultants.orgId, org.id),
            ),
          )
          .orderBy(consultants.role, consultants.firmName)
      : Promise.resolve([]),
    db
      .select({ id: users.id, name: authUser.name, email: authUser.email })
      .from(users)
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .where(eq(users.orgId, org.id))
      .orderBy(asc(authUser.name)),
  ]);

  return buildUnifiedComposerData({ teamRows, consultantRows, orgRows });
}

// ---------------------------------------------------------------------
// Kick off PSA composer
// ---------------------------------------------------------------------
//
// Recipients come from the deal's consultant roster (role =
// "psa_attorney"), not from any deal-level field. deals.psa_attorney_name
// and psa_attorney_firm are legacy free text with nowhere to put an
// address, and are being retired; deals.psa_drafting stays, because
// whose counsel holds the pen is a fact about the transaction rather
// than an attribute of a firm. See docs/backlog.md.
//
// Queries only. Shaping lives in src/lib/psa-attorney.ts so it can be
// exercised by npm run verify:psa-resolution.
export type { PsaKickoffComposerData } from "@/lib/psa-attorney";

export async function getPsaKickoffComposerData(input: {
  dealId: string;
}): Promise<PsaKickoffComposerData> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const [dealRow, psaRows, teamRows, orgRows] = await Promise.all([
    db
      .select({ drafting: deals.psaDrafting })
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)))
      .limit(1),
    db
      .select({
        id: consultants.id,
        firmName: consultants.firmName,
        contactName: consultants.contactName,
        contactEmail: consultants.contactEmail,
        side: consultants.side,
      })
      .from(consultants)
      .where(
        and(
          eq(consultants.dealId, input.dealId),
          eq(consultants.orgId, org.id),
          eq(consultants.role, "psa_attorney"),
        ),
      )
      .orderBy(consultants.side, consultants.firmName),
    db
      .select({
        id: dealTeamMembers.id,
        team: dealTeamMembers.team,
        roleLabel: dealTeamMembers.roleLabel,
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
        ),
      )
      .orderBy(
        dealTeamMembers.team,
        dealTeamMembers.sortOrder,
        dealTeamMembers.createdAt,
      ),
    db
      .select({ id: users.id, name: authUser.name, email: authUser.email })
      .from(users)
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .where(eq(users.orgId, org.id))
      .orderBy(asc(authUser.name)),
  ]);

  return buildPsaKickoffComposerData({
    psaRows,
    drafting: dealRow[0]?.drafting ?? null,
    teamRows,
    orgRows,
  });
}

// The Phase 3 "Sign LOI" checklist item, so the kickoff composer can
// offer the executed LOI as an attachment. Mirrors getOmItemId.
export async function getSignLoiItemId(input: {
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
  return itemRows.find((r) => r.name.toLowerCase().includes("sign loi"))?.id ?? null;
}

export async function setDealTeamMemberIncluded(input: {
  memberId: string;
  dealId: string;
  included: boolean;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();
  const before = await loadDealTeamMemberAuditContext(org.id, input.memberId);

  await db
    .update(dealTeamMembers)
    .set({ includeInEmails: input.included })
    .where(
      and(
        eq(dealTeamMembers.id, input.memberId),
        eq(dealTeamMembers.orgId, org.id),
      ),
    );

  // This one checkbox decides whether a member is on the recipient list of
  // every Deal-Team send, so "why did the seller stop getting these" has to be
  // answerable. Split into two actions so the viewer can filter exclusions on
  // their own. A toggle re-sent at its current value (double click, stale
  // optimistic render) changes nothing and logs nothing.
  if (before && before.includeInEmails !== input.included) {
    const identity = dealTeamMemberIdentity(before);
    // roleLabel and the resolved email are uncapped free text, so both are
    // capped on the way into jsonb the way the snapshot caps them.
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: input.included
        ? "deal_team_member.emails_included"
        : "deal_team_member.emails_excluded",
      entityType: "deal_team_member",
      entityId: input.memberId,
      before: { includeInEmails: before.includeInEmails },
      after: { includeInEmails: input.included },
      metadata: {
        dealId: before.dealId,
        dealName: before.dealName,
        label: dealTeamMemberLabel(before),
        team: before.team,
        roleLabel: truncateForAudit(before.roleLabel),
        // The address the change is about, so it belongs in an entry about
        // mail delivery.
        memberEmail: truncateForAudit(identity.email),
      },
    });
  }

  revalidatePath(`/deals/${input.dealId}`);
}

// Provenance for one blast, assembled before the send so it is available on
// both the resolved and the thrown path.
//
// Subject, recipients, sender and attachment names are what makes a send
// findable later. The message BODY is deliberately absent: it is content, not
// provenance, and copying every client-facing email into audit_log would turn
// the journal into a second mail store.
function describeBlastForAudit(emails: ResolvedEmail[]) {
  // Subject is interpolated per builder ({{builderName}} and friends), so one
  // batch can carry several. The batch-level `subject` is a sample of the
  // first, which is why `subjectVariants` sits beside it and why each target
  // below carries the subject actually addressed to it: on a partial failure,
  // a lone batch subject would name whichever builder happened to sort first,
  // including one that never received anything.
  const subjects = Array.from(new Set(emails.map((e) => e.subject)));
  // The composer applies one sender to the whole batch; joined rather than
  // indexed so a future per-recipient sender is not silently misreported.
  const senders = Array.from(
    new Set(emails.map((e) => e.from?.email).filter((v): v is string => Boolean(v))),
  );
  // De-duped by attachment id, since the same selection rides on every
  // per-builder email. Names only, never bytes.
  const attachments = Array.from(
    new Map(
      emails
        .flatMap((e) => e.attachments)
        .map((a): [string, { kind: string; name: string | null }] => [
          a.id,
          {
            kind: a.kind,
            name: truncateForAudit(a.kind === "link" ? (a.label ?? a.url) : a.filename),
          },
        ]),
    ).values(),
  );
  return {
    subject: truncateForAudit(subjects[0] ?? null),
    subjectVariants: subjects.length,
    from: senders.join(", ") || null,
    attachments,
    // One outbound message per target. Deal Team sends put the sub-team key
    // ("owner" / "broker" / "buyer") in builderId rather than a builder UUID,
    // so these ids are not all UUIDs and cannot go in entity_id.
    //
    // targetCount and recipientCount are counted across the whole batch and
    // stay true no matter how large it is. The per-target list beneath them is
    // capped like every other list in this file, because a blast can address a
    // whole marketing list, and the flag says when it stops short.
    targetCount: emails.length,
    recipientCount: emails.reduce((n, e) => n + e.to.length + e.cc.length, 0),
    targets: emails.slice(0, MAX_LOGGED_AUDIT_IDS).map((e) => ({
      id: e.builderId,
      // builders.name, an uncapped text column, interpolated into the entry.
      name: truncateForAudit(e.builderName),
      subject: truncateForAudit(e.subject),
      to: e.to.map((t) => t.email),
      cc: e.cc.map((c) => c.email),
    })),
    targetsTruncated: emails.length > MAX_LOGGED_AUDIT_IDS,
  };
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

  // A blast is the only client-facing action in the platform that writes no
  // row of its own, so without an entry here, mail sent to homebuilders on the
  // brokerage's behalf leaves no trace anywhere. There is no row to point at,
  // so entityId stays null: "email_blast" is not a table, and a deal uuid
  // parked under it would hand a reader an id that resolves to the wrong
  // object. The deal identity lives in metadata.dealId / dealName, which is
  // where the viewer's per-deal filter reads it from anyway. A composer that
  // passed no dealId (or a deal in another org) lands unattributed rather than
  // claiming a deal it could not verify.
  const user = await getCurrentUser();
  const deal = opts?.dealId ? await loadDealAuditContext(org.id, opts.dealId) : null;
  const detail = describeBlastForAudit(emails);
  const dealMetadata = {
    dealId: deal?.id ?? null,
    dealName: deal?.name ?? null,
    // The subject is the only thing that tells one send apart from another on
    // the same deal (OM blast vs. Q&A distribution vs. day-of reminder), so it
    // goes in label: the viewer renders label as its own column and searches
    // it, and it searches neither metadata nor a batch that writes no
    // before/after. Already truncated inside describeBlastForAudit.
    label: detail.subject,
  };

  // Written AFTER the send resolves so the recorded outcome is the real one.
  // A throw means the batch died mid-flight (attachment fetch, an unhandled
  // transport error) and what actually went out is unknown, so it gets its own
  // action and the error is rethrown untouched.
  let result: BlastSendResult;
  try {
    result = await sendResolvedEmails(emails, { orgId: org.id, dealId: opts?.dealId });
  } catch (err) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "email_blast.send_aborted",
      entityType: "email_blast",
      entityId: null,
      metadata: {
        ...dealMetadata,
        ...detail,
        error: truncateForAudit(err instanceof Error ? err.message : String(err)),
      },
    });
    throw err;
  }

  // Per-target success/failure is the whole point of the entry: a partial
  // failure is exactly what someone comes looking for weeks later ("did Toll
  // Brothers ever get the OM?"). Keyed by builderId because the composer emits
  // one email per distinct target. The list is the capped one describeBlastForAudit
  // built, so on a batch past the cap it answers that question for the first
  // MAX_LOGGED_AUDIT_IDS targets only; `sent`, `failed` and `targetCount` stay
  // true for the whole batch and `targetsTruncated` says the list stops short.
  if (emails.length > 0) {
    const outcomeByTarget = new Map(
      result.outcomes.map((o) => [o.builderId, o] as const),
    );
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action:
        result.failed === 0
          ? "email_blast.sent"
          : result.sent === 0
            ? "email_blast.send_failed"
            : "email_blast.partially_sent",
      entityType: "email_blast",
      entityId: null,
      metadata: {
        ...dealMetadata,
        ...detail,
        sent: result.sent,
        failed: result.failed,
        targets: detail.targets.map((t) => {
          const outcome = outcomeByTarget.get(t.id);
          return {
            ...t,
            ok: outcome ? outcome.ok : null,
            error: outcome && !outcome.ok ? truncateForAudit(outcome.reason) : null,
          };
        }),
      },
    });
  }

  return result;
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

  // Snapshot before the blind bulk UPDATE: builder names so the entry lists
  // who was marked instead of a column of UUIDs, and the prior timestamps so a
  // re-mark of a builder who had already been sent to reads as one.
  const user = await getCurrentUser();
  const before = await db
    .select({
      builderId: dealBuyers.builderId,
      builderName: builders.name,
      omSentAt: dealBuyers.omSentAt,
      ddSentAt: dealBuyers.ddSentAt,
      dealId: dealBuyers.dealId,
      dealName: deals.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(builders.id, dealBuyers.builderId))
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(
      and(
        eq(dealBuyers.dealId, input.dealId),
        eq(dealBuyers.orgId, org.id),
        inArray(dealBuyers.builderId, input.builderIds),
      ),
    );

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

  // One entry for the batch: this fires once per blast, immediately after the
  // send, so per-builder rows would double the log volume of every send. The
  // om-vs-dd distinction rides in metadata rather than in the action string
  // because both are the same act (stamping a per-buyer sent timestamp), the
  // way the checklist batch keeps Est.-vs-Actual in metadata.dateKind. A batch
  // has no single target row, so entityId stays null rather than holding a deal
  // uuid under a deal_buyer chip; the deal identity is in metadata.dealId /
  // dealName. Nothing is logged when the builder ids matched no rows on this
  // deal.
  if (before.length > 0) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "deal_buyer.bulk_sent_marked",
      entityType: "deal_buyer",
      entityId: null,
      // A blast can mark a whole marketing list, so every list this entry
      // carries is capped and flagged. builderCount below is the true total.
      // builders.name is an uncapped text column, so each name is truncated on
      // the way into jsonb.
      before: {
        builders: before.slice(0, MAX_LOGGED_AUDIT_IDS).map((r) => ({
          builderId: r.builderId,
          builderName: truncateForAudit(r.builderName),
          sentAt: input.field === "om" ? r.omSentAt : r.ddSentAt,
        })),
        buildersTruncated: before.length > MAX_LOGGED_AUDIT_IDS,
      },
      after: { sentAt: now },
      metadata: {
        dealId: before[0].dealId,
        dealName: before[0].dealName,
        // No single row to name, and the viewer already gives the deal its own
        // column, so a label here would just read as the deal name twice.
        label: null,
        field: input.field,
        builderCount: before.length,
        builderIds: before.slice(0, MAX_LOGGED_AUDIT_IDS).map((r) => r.builderId),
        builderNames: before
          .slice(0, MAX_LOGGED_AUDIT_IDS)
          .map((r) => truncateForAudit(r.builderName)),
        buildersTruncated: before.length > MAX_LOGGED_AUDIT_IDS,
      },
    });
  }

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
