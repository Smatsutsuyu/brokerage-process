"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { formatPhone } from "@/lib/phone";

// Contacts surface in two places: /contacts (the directory) and the
// per-deal Contacts tab (rendered via the dynamic /deals/[id] route). Any
// contact mutation needs both invalidated or the deal pages serve stale data.
function revalidateContactSurfaces() {
  revalidatePath("/contacts");
  revalidatePath("/deals/[id]", "page");
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
};

export async function createContact(input: ContactInput): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new Error("First name is required");

  // Builder must belong to this org if provided. Forging a cross-org id in
  // the form payload otherwise lets a contact dangle to another tenant.
  if (input.builderId) {
    const [b] = await db
      .select({ id: builders.id })
      .from(builders)
      .where(and(eq(builders.id, input.builderId), eq(builders.orgId, org.id)))
      .limit(1);
    if (!b) throw new Error("Builder not found");
  }

  const [created] = await db
    .insert(contacts)
    .values({
      orgId: org.id,
      builderId: input.builderId ?? null,
      firstName,
      lastName,
      title: input.title?.trim() || null,
      email: input.email?.trim() || null,
      phone: formatPhone(input.phone),
      geography: input.geography?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();

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

  if (input.data.builderId) {
    const [b] = await db
      .select({ id: builders.id })
      .from(builders)
      .where(and(eq(builders.id, input.data.builderId), eq(builders.orgId, org.id)))
      .limit(1);
    if (!b) throw new Error("Builder not found");
  }

  await db
    .update(contacts)
    .set({
      builderId: input.data.builderId ?? null,
      firstName,
      lastName,
      title: input.data.title?.trim() || null,
      email: input.data.email?.trim() || null,
      phone: formatPhone(input.data.phone),
      geography: input.data.geography?.trim() || null,
      notes: input.data.notes?.trim() || null,
    })
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)));

  revalidateContactSurfaces();
}

export async function deleteContact(contactId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));

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
  classification: "private" | "public" = "private",
): Promise<{
  builderId: string;
  created: boolean;
}> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Builder name is required");

  const [existing] = await db
    .select({ id: builders.id })
    .from(builders)
    .where(and(eq(builders.orgId, org.id), ilike(builders.name, trimmed)))
    .limit(1);
  if (existing) return { builderId: existing.id, created: false };

  const [created] = await db
    .insert(builders)
    .values({
      orgId: org.id,
      name: trimmed,
      classification,
    })
    .returning();
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
  newBuilderClassification: "private" | "public" | null;
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

  // Cache "create new builder" decisions across the batch so multiple rows
  // citing the same new company only create one builder.
  const newBuilderCache = new Map<string, string>();

  for (const row of rows) {
    const firstName = row.firstName.trim();
    if (!firstName) {
      skipped++;
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
        if (result.created) buildersCreated++;
        newBuilderCache.set(cacheKey, builderId);
      }
    }

    // Dedupe by email (case-insensitive) within the org. If a contact with
    // this email already exists, update it; otherwise insert. Contacts with
    // no email always insert (no way to dedupe without it).
    const emailNorm = row.email?.trim().toLowerCase() || null;
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
      email: row.email?.trim() || null,
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
    } else {
      await db.insert(contacts).values({
        orgId: org.id,
        ...values,
      });
      contactsCreated++;
    }
  }

  revalidateContactSurfaces();
  return { contactsCreated, contactsUpdated, buildersCreated, skipped };
}
