"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealBuyers, dealContacts, deals } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { MAX_LOGGED_AUDIT_IDS, builderLabel } from "@/lib/audit-shared";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
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

  // getCurrentOrg short-circuits on a null user, so `org` being set already
  // implies a signed-in user. Read it to attribute the entry. Free at
  // runtime: getCurrentUser is wrapped in React cache() and getCurrentOrg
  // has already called it this request.
  const user = await getCurrentUser();

  const [created] = await db
    .insert(builders)
    .values({
      orgId: org.id,
      name,
      classification: input.classification,
      notes: input.notes?.trim() || null,
    })
    .returning();

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "builder.created",
    entityType: "builder",
    entityId: created.id,
    after: {
      // builders.name is uncapped text with only a .trim() applied above,
      // so it cannot go into jsonb raw.
      name: truncateForAudit(created.name),
      classification: created.classification,
      notes: truncateForAudit(created.notes),
    },
    // No dealId / dealName: /builders is the org-wide directory, so this
    // entry belongs to no deal.
    metadata: { label: builderLabel(created.name) },
  });

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

  const notes = input.data.notes?.trim() || null;

  const user = await getCurrentUser();

  // The update below is blind, so read the row first. Without this the log
  // records that a builder changed but not what it changed from, and a
  // company rename is exactly the change someone comes to the log about.
  const [before] = await db
    .select({
      name: builders.name,
      classification: builders.classification,
      notes: builders.notes,
    })
    .from(builders)
    .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)))
    .limit(1);

  await db
    .update(builders)
    .set({
      name,
      classification: input.data.classification,
      notes,
    })
    .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)));

  // The edit form re-submits every field, so skip the entry when the save
  // moved nothing.
  if (
    before &&
    (before.name !== name ||
      before.classification !== input.data.classification ||
      before.notes !== notes)
  ) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "builder.updated",
      entityType: "builder",
      entityId: input.builderId,
      // The comparison above runs on the raw values, so an edit past the
      // truncation boundary still lands here. Only the payload is capped.
      before: {
        name: truncateForAudit(before.name),
        classification: before.classification,
        notes: truncateForAudit(before.notes),
      },
      after: {
        name: truncateForAudit(name),
        classification: input.data.classification,
        notes: truncateForAudit(notes),
      },
      metadata: { label: builderLabel(name) },
    });
  }

  revalidateBuilderSurfaces();
}

export async function deleteBuilder(builderId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

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
  //
  // Everything those orphan rows hold is selected here, not just their deal
  // identity: they are hard-deleted below, so this read is the last chance to
  // record the tier, the lead, the CC list, the tracking stamps and the
  // comments before they are gone for good.
  const buyerRows = await db
    .select({
      dealBuyerId: dealBuyers.id,
      dealId: dealBuyers.dealId,
      dealName: deals.name,
      tier: dealBuyers.tier,
      leadUserId: dealBuyers.leadUserId,
      ccUserIds: dealBuyers.ccUserIds,
      calledAt: dealBuyers.calledAt,
      confiSignedAt: dealBuyers.confiSignedAt,
      omSentAt: dealBuyers.omSentAt,
      ddSentAt: dealBuyers.ddSentAt,
      offerReceivedAt: dealBuyers.offerReceivedAt,
      comments: dealBuyers.comments,
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

  // Snapshot before the transaction: once the row is gone the audit entry
  // is the only surviving record of what this builder was.
  const [before] = await db
    .select({
      name: builders.name,
      classification: builders.classification,
      notes: builders.notes,
    })
    .from(builders)
    .where(and(eq(builders.id, builderId), eq(builders.orgId, org.id)))
    .limit(1);

  // contacts.builder_id is ON DELETE SET NULL, so this builder's people
  // survive the delete but silently detach into standalone contacts. The
  // detach happens in Postgres, so no contact.updated entry is written for
  // it and a bare count would name nobody. Read the rows themselves.
  const detached = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(and(eq(contacts.builderId, builderId), eq(contacts.orgId, org.id)));

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

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "builder.deleted",
      entityType: "builder",
      entityId: builderId,
      before: {
        // Uncapped text column, so it cannot go into jsonb raw.
        name: truncateForAudit(before.name),
        classification: before.classification,
        notes: truncateForAudit(before.notes),
      },
      metadata: {
        label: builderLabel(before.name),
        // detachedContacts is the authoritative total. The two lists below
        // are capped because this is not a theoretical bound: one Excel
        // import can put hundreds of contacts under a single builder, and
        // deleting it detaches every one of them into a jsonb value in a
        // table that only ever grows. Same cap the import writes them under.
        detachedContacts: detached.length,
        detachedContactIds: detached.slice(0, MAX_LOGGED_AUDIT_IDS).map((c) => c.id),
        detachedContactNames: detached
          .slice(0, MAX_LOGGED_AUDIT_IDS)
          .map((c) => truncateForAudit(`${c.firstName} ${c.lastName}`.trim())),
        detachedContactsTruncated: detached.length > MAX_LOGGED_AUDIT_IDS,
        // The swept deal_buyers rows were hidden from the UI, so the tier
        // and lead assignment they carried vanish with no visible trace.
        // This is the only place it shows up, which is why the whole row is
        // written out and not just the deal it sat on.
        ...(orphanIds.length > 0
          ? {
              sweptDealBuyers: buyerRows.map((r) => ({
                dealBuyerId: r.dealBuyerId,
                dealId: r.dealId,
                // deals.name is an uncapped text column as well.
                dealName: truncateForAudit(r.dealName),
                tier: r.tier,
                leadUserId: r.leadUserId,
                ccUserIds: r.ccUserIds,
                calledAt: r.calledAt,
                confiSignedAt: r.confiSignedAt,
                omSentAt: r.omSentAt,
                ddSentAt: r.ddSentAt,
                offerReceivedAt: r.offerReceivedAt,
                // Uncapped text column, so it cannot go into jsonb raw.
                comments: truncateForAudit(r.comments),
              })),
            }
          : {}),
      },
    });
  }

  revalidateBuilderSurfaces();
}
