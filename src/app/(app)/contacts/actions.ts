"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealContacts, deals } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { MAX_LOGGED_AUDIT_IDS, builderLabel } from "@/lib/audit-shared";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { findBuilderByName } from "@/lib/builders";
import { parseEmailAddress } from "@/lib/email-address";
import { formatPhone } from "@/lib/phone";

// Contacts surface in two places: /contacts (the directory) and the
// per-deal Contacts tab (rendered via the dynamic /deals/[id] route). Any
// contact mutation needs both invalidated or the deal pages serve stale data.
function revalidateContactSurfaces() {
  revalidatePath("/contacts");
  revalidatePath("/deals/[id]", "page");
}

// Contacts have no single name column, and an audit entry that can only
// show a UUID is unreadable. Every entry below carries this as its label.
// Both columns are uncapped text and the viewer renders the label inline in
// a column of its own, so the joined name is capped the way qaLabel caps a
// question. Same cap the deal-page contactLabel uses, so one person's entries
// read identically whichever surface wrote them.
function contactLabel(firstName: string, lastName: string): string {
  const joined = `${firstName} ${lastName}`.trim();
  return joined.length > 80 ? `${joined.slice(0, 80)}…` : joined;
}

// Pre-mutation snapshot for updateContact / deleteContact. Both writes are
// otherwise blind (`db.update` / `db.delete` with no prior read), so without
// this the log could record that a directory row changed or vanished but not
// what it held. The left join denormalizes the builder name: builder_id on
// its own reads as a bare UUID in the viewer.
//
// Returns null when the contact does not exist or belongs to another org,
// which is exactly when the caller's own org-scoped write no-ops. Callers
// skip the audit entry in that case rather than logging a change that never
// landed.
async function loadContactAuditContext(contactId: string, orgId: string) {
  const [row] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      phone: contacts.phone,
      geography: contacts.geography,
      notes: contacts.notes,
      builderId: contacts.builderId,
      receivesCommunication: contacts.receivesCommunication,
      builderName: builders.name,
    })
    .from(contacts)
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

type ContactSnapshotRow = {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  geography: string | null;
  notes: string | null;
  builderId: string | null;
  receivesCommunication: boolean;
};

// The fields worth keeping in a before/after snapshot. Every string column
// here is uncapped free text in the schema (geography is hand-typed, "SoCal"
// or "Bay Area + Sacramento"), so all of them go through truncateForAudit
// before they reach jsonb, not just the one that reads like prose. This
// snapshot is written on contact.created, on both sides of contact.updated
// and on contact.deleted, so one oversized paste would otherwise land in the
// log four times over.
function contactSnapshot(row: ContactSnapshotRow) {
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

export type ContactInput = {
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  geography?: string;
  notes?: string;
  // Optional builder. Pass an existing builderId, or null/undefined for a
  // standalone contact. To create a new builder during contact create, the
  // caller should call createBuilder first and pass the returned id here.
  builderId?: string | null;
  // Marketing-blast opt-in. Optional — defaults to true at the schema
  // level so older callers behave the same.
  receivesCommunication?: boolean;
};

export async function createContact(input: ContactInput): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new Error("First name is required");

  // Builder must belong to this org if provided. Forging a cross-org id in
  // the form payload otherwise lets a contact dangle to another tenant.
  // The name comes back on the same round-trip so the audit entry can name
  // the company instead of logging a bare builder_id.
  let builderName: string | null = null;
  if (input.builderId) {
    const [b] = await db
      .select({ id: builders.id, name: builders.name })
      .from(builders)
      .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)))
      .limit(1);
    if (!b) throw new Error("Builder not found");
    builderName = b.name;
  }

  // getCurrentOrg short-circuits on a null user, so `org` being set already
  // implies a signed-in user. Read it to attribute the entry. Free at
  // runtime: getCurrentUser is wrapped in React cache() and getCurrentOrg
  // has already called it this request.
  const user = await getCurrentUser();

  const [created] = await db
    .insert(contacts)
    .values({
      orgId: org.id,
      builderId: input.builderId ?? null,
      firstName,
      lastName,
      title: input.title?.trim() || null,
      email: parseEmailAddress(input.email),
      phone: formatPhone(input.phone),
      geography: input.geography?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(input.receivesCommunication !== undefined
        ? { receivesCommunication: input.receivesCommunication }
        : {}),
    })
    .returning();

  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "contact.created",
    entityType: "contact",
    entityId: created.id,
    after: contactSnapshot(created),
    // No dealId / dealName: /contacts is the org-wide directory, so this
    // entry belongs to no deal.
    metadata: {
      label: contactLabel(created.firstName, created.lastName),
      // builders.name is uncapped text as well, so the denormalized company
      // name gets the same treatment as the contact's own columns.
      builderName: truncateForAudit(builderName),
    },
  });

  revalidateContactSurfaces();
  return created.id;
}

export async function updateContact(input: {
  contactId: string;
  data: ContactInput;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.data.firstName.trim();
  const lastName = input.data.lastName.trim();
  if (!firstName) throw new Error("First name is required");

  let builderName: string | null = null;
  if (input.data.builderId) {
    const [b] = await db
      .select({ id: builders.id, name: builders.name })
      .from(builders)
      .where(and(eq(builders.id, input.data.builderId), eq(builders.orgId, org.id)))
      .limit(1);
    if (!b) throw new Error("Builder not found");
    builderName = b.name;
  }

  const user = await getCurrentUser();

  // Built before the snapshot read so a bad email still throws without
  // costing an extra query, same as when this was inline in .set().
  const patch = {
    builderId: input.data.builderId ?? null,
    firstName,
    lastName,
    title: input.data.title?.trim() || null,
    email: parseEmailAddress(input.data.email),
    phone: formatPhone(input.data.phone),
    geography: input.data.geography?.trim() || null,
    notes: input.data.notes?.trim() || null,
    ...(input.data.receivesCommunication !== undefined
      ? { receivesCommunication: input.data.receivesCommunication }
      : {}),
  };

  const before = await loadContactAuditContext(input.contactId, org.id);

  await db
    .update(contacts)
    .set(patch)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  // The edit form re-submits every field on every save, so most saves move
  // nothing. Log only when something actually did, and name the fields that
  // moved so the viewer doesn't make the reader diff nine keys by eye.
  const changedFields: string[] = [];
  if (before) {
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      if (before[key] !== patch[key]) changedFields.push(key);
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
      after: contactSnapshot({ ...before, ...patch }),
      metadata: {
        label: contactLabel(firstName, lastName),
        // builderName is the PRE-edit company, matching the same key on the
        // deal-page updateContact. contact.updated is written from both
        // surfaces, so one key reading pre-edit here and post-edit there
        // would mean two different things in one action's log. The
        // destination rides alongside it only when the contact actually
        // moved, where a null reads as "detached from its builder" rather
        // than as an absent lookup. Both are uncapped builders.name values,
        // so both are truncated on the way into jsonb.
        builderName: truncateForAudit(before.builderName),
        ...(changedFields.includes("builderId")
          ? { builderNameAfter: truncateForAudit(builderName) }
          : {}),
        changedFields,
      },
    });
  }

  revalidateContactSurfaces();
}

export async function deleteContact(contactId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const user = await getCurrentUser();

  // Snapshot before the row goes: afterwards the audit entry is the only
  // surviving record of this person. deal_contacts cascades on the contact
  // FK, so their presence on live deals disappears silently along with them
  // and is captured here too.
  const before = await loadContactAuditContext(contactId, org.id);
  const attachedDeals = before
    ? await db
        .select({ dealId: dealContacts.dealId, dealName: deals.name })
        .from(dealContacts)
        .innerJoin(deals, eq(deals.id, dealContacts.dealId))
        .where(and(eq(dealContacts.contactId, contactId), eq(dealContacts.orgId, org.id)))
    : [];

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));

  if (before) {
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "contact.deleted",
      entityType: "contact",
      entityId: contactId,
      before: contactSnapshot(before),
      metadata: {
        label: contactLabel(before.firstName, before.lastName),
        builderName: truncateForAudit(before.builderName),
        // deals.name is uncapped text too, so the denormalized deal names
        // cannot ride into jsonb raw either.
        removedFromDeals: attachedDeals.map((d) => ({
          dealId: d.dealId,
          dealName: truncateForAudit(d.dealName),
        })),
      },
    });
  }

  revalidateContactSurfaces();
}

// Find existing builder by name (case-insensitive) or create new. Used by
// both the contact form's "+ Create new builder" affordance and by the Excel
// importer when an unmatched company name appears.
//
// classification only applies to the create path — when matching an existing
// builder, we never overwrite its classification (would silently mutate
// data the user might have intentionally curated elsewhere).
export async function findOrCreateBuilder(
  name: string,
  classification: "private" | "public" | "developer" = "private",
): Promise<{
  builderId: string;
  created: boolean;
}> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Builder name is required");

  const existing = await findBuilderByName(db, org.id, trimmed);
  if (existing) return { builderId: existing.id, created: false };

  const user = await getCurrentUser();

  const [created] = await db
    .insert(builders)
    .values({
      orgId: org.id,
      name: trimmed,
      classification,
    })
    .returning();

  // Only the create path is audited. A lookup that matched an existing
  // builder wrote nothing, so it has nothing to report.
  await writeAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "builder.created",
    entityType: "builder",
    entityId: created.id,
    after: {
      // Uncapped text column, so it cannot go into jsonb raw.
      name: truncateForAudit(created.name),
      classification: created.classification,
      notes: truncateForAudit(created.notes),
    },
    metadata: {
      label: builderLabel(created.name),
      // Same action string as the /builders form so both paths share one
      // row in the viewer's Action filter. This flag is the sub-variant:
      // the builder appeared as a side effect of a contact form or an
      // Excel import rather than being added deliberately.
      createdVia: "find_or_create",
    },
  });

  return { builderId: created.id, created: true };
}

// Bulk import payload from the Excel preview screen. Each row has been
// validated client-side and the user has confirmed builder match/create
// decisions before this is called.
export type ImportContactRow = {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  geography: string | null;
  // Either an existing builderId (matched at preview time) or a name to
  // create + assign. null means import the contact standalone.
  builderId: string | null;
  newBuilderName: string | null;
  // Classification for the new builder — only honored when newBuilderName
  // is set. null falls back to the default ("private").
  newBuilderClassification: "private" | "public" | "developer" | null;
};

export type ImportResult = {
  contactsCreated: number;
  contactsUpdated: number;
  buildersCreated: number;
  skipped: number;
};

export async function importContacts(rows: ImportContactRow[]): Promise<ImportResult> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  let contactsCreated = 0;
  let contactsUpdated = 0;
  let buildersCreated = 0;
  let skipped = 0;

  // Audit-only bookkeeping. The two skip reasons are separate here because
  // "12 rows didn't import" is the question an operator asks after a bad
  // sheet, and the single `skipped` count in the return value can't answer
  // it. Ids are collected so a mistaken import can be traced to the exact
  // rows it touched.
  let skippedMissingName = 0;
  let skippedInvalidEmail = 0;
  const createdContactIds: string[] = [];
  const updatedContactIds: string[] = [];
  const createdBuilderIds: string[] = [];

  // Cache "create new builder" decisions across the batch so multiple rows
  // citing the same new company only create one builder.
  const newBuilderCache = new Map<string, string>();

  for (const row of rows) {
    const firstName = row.firstName.trim();
    if (!firstName) {
      skipped++;
      skippedMissingName++;
      continue;
    }

    let builderId: string | null = row.builderId ?? null;
    if (!builderId && row.newBuilderName) {
      const cacheKey = row.newBuilderName.trim().toLowerCase();
      const cached = newBuilderCache.get(cacheKey);
      if (cached) {
        builderId = cached;
      } else {
        const result = await findOrCreateBuilder(
          row.newBuilderName,
          row.newBuilderClassification ?? "private",
        );
        builderId = result.builderId;
        if (result.created) {
          buildersCreated++;
          createdBuilderIds.push(result.builderId);
        }
        newBuilderCache.set(cacheKey, builderId);
      }
    }

    // Parse-and-validate the email. Bulk import must not throw on one
    // bad row — catch and skip so the rest of the sheet still imports.
    let parsedEmail: string | null = null;
    try {
      parsedEmail = parseEmailAddress(row.email);
    } catch {
      skipped++;
      skippedInvalidEmail++;
      continue;
    }

    // Dedupe by email (case-insensitive) within the org. If a contact with
    // this email already exists, update it; otherwise insert. Contacts with
    // no email always insert (no way to dedupe without it).
    const emailNorm = parsedEmail?.toLowerCase() ?? null;
    let existingId: string | null = null;
    if (emailNorm) {
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, org.id), ilike(contacts.email, emailNorm)))
        .limit(1);
      if (existing) existingId = existing.id;
    }

    const values = {
      firstName,
      lastName: row.lastName.trim(),
      title: row.title?.trim() || null,
      email: parsedEmail,
      phone: formatPhone(row.phone),
      geography: row.geography?.trim() || null,
      builderId,
    };

    if (existingId) {
      await db
        .update(contacts)
        .set(values)
        .where(and(eq(contacts.id, existingId), eq(contacts.orgId, org.id)));
      contactsUpdated++;
      updatedContactIds.push(existingId);
    } else {
      const [inserted] = await db
        .insert(contacts)
        .values({
          orgId: org.id,
          ...values,
        })
        .returning();
      contactsCreated++;
      createdContactIds.push(inserted.id);
    }
  }

  // One entry for the whole import, not one per row: a sheet can carry
  // hundreds of rows, and the question the log answers is "who loaded a
  // list and what did it do to the directory". Builders created along the
  // way still get their own builder.created entries from
  // findOrCreateBuilder, since each is a new directory record in its own
  // right. A sheet where every row was rejected still gets an entry: the
  // no-change-no-entry rule covers toggles the UI re-sends on its own, and
  // "I uploaded the list and nothing happened" is precisely the incident an
  // operator comes to the log with. Only an empty payload writes nothing.
  if (rows.length > 0) {
    const user = await getCurrentUser();
    // Past the shared cap the ids are dropped rather than sliced: the counts
    // above already say what the import did, and a partial list of "which
    // rows" is more misleading than none.
    const idsFit = createdContactIds.length + updatedContactIds.length <= MAX_LOGGED_AUDIT_IDS;
    await writeAudit({
      orgId: org.id,
      userId: user?.id ?? null,
      action: "contact.bulk_imported",
      entityType: "contact",
      // No single UUID target, and entity_id is UUID-typed so a synthetic
      // batch key cannot go here. The affected ids live in metadata.
      entityId: null,
      metadata: {
        label: "Excel contact import",
        rowsSubmitted: rows.length,
        contactsCreated,
        contactsUpdated,
        buildersCreated,
        skipped,
        skippedMissingName,
        skippedInvalidEmail,
        ...(idsFit
          ? { createdContactIds, updatedContactIds, createdBuilderIds }
          : { affectedIdsOmitted: true }),
      },
    });
  }

  revalidateContactSurfaces();
  return { contactsCreated, contactsUpdated, buildersCreated, skipped };
}
