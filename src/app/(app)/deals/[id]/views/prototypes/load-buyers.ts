import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, builders, contacts, dealBuyers, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import type { LeadOption } from "../lead-picker";
import type { ExistingContactOption } from "../pick-existing-contact-modal";

export type Tier = "green" | "yellow" | "red" | "not_selected";
export type Classification = "private" | "public";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type BuyerGroup = {
  dealBuyerId: string;
  builderId: string;
  builderName: string;
  classification: Classification;
  tier: Tier;
  leadUserId: string | null;
  leadName: string | null;
  called: boolean;
  omSent: boolean;
  comments: string | null;
  contacts: ContactRow[];
};

export type BuyerData = {
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
  // Org-wide contacts directory for the "+ Existing Contact" picker. Loaded
  // once here so each prototype view doesn't re-query.
  orgContacts: ExistingContactOption[];
};

// Shared loader so each prototype view doesn't re-implement the JOIN.
// Returns one BuyerGroup per builder-on-deal with its contacts nested.
export async function loadBuyers(dealId: string): Promise<BuyerData> {
  const org = await getCurrentOrg();

  const rows = await db
    .select({
      dealBuyerId: dealBuyers.id,
      tier: dealBuyers.tier,
      omSentAt: dealBuyers.omSentAt,
      calledAt: dealBuyers.calledAt,
      comments: dealBuyers.comments,
      builderId: builders.id,
      builderName: builders.name,
      classification: builders.classification,
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      contactNotes: contacts.notes,
      leadUserId: dealBuyers.leadUserId,
      leadName: authUser.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(dealBuyers.builderId, builders.id))
    .leftJoin(contacts, eq(contacts.builderId, builders.id))
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(dealBuyers.dealId, dealId))
    .orderBy(builders.name, contacts.lastName);

  const map = new Map<string, BuyerGroup>();
  for (const r of rows) {
    let g = map.get(r.dealBuyerId);
    if (!g) {
      g = {
        dealBuyerId: r.dealBuyerId,
        builderId: r.builderId,
        builderName: r.builderName,
        classification: r.classification,
        tier: r.tier,
        leadUserId: r.leadUserId,
        leadName: r.leadName,
        called: r.calledAt !== null,
        omSent: r.omSentAt !== null,
        comments: r.comments,
        contacts: [],
      };
      map.set(r.dealBuyerId, g);
    }
    if (r.contactId) {
      g.contacts.push({
        id: r.contactId,
        firstName: r.contactFirstName ?? "",
        lastName: r.contactLastName ?? "",
        fullName: `${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim(),
        title: r.contactTitle,
        email: r.contactEmail,
        phone: r.contactPhone,
        notes: r.contactNotes,
      });
    }
  }

  const orgUsers = org
    ? await db
        .select({
          id: users.id,
          name: authUser.name,
          email: authUser.email,
        })
        .from(users)
        .innerJoin(authUser, eq(authUser.id, users.authUserId))
        .where(eq(users.orgId, org.id))
        .orderBy(asc(authUser.name))
    : [];

  const leadOptions: LeadOption[] = orgUsers.map((u) => ({
    id: u.id,
    name: u.name || u.email,
  }));

  // Pull org-wide contacts (joined to optional builder name) for the picker.
  // Same shape as the production view's contacts-view loader.
  const orgContactRows = org
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          title: contacts.title,
          email: contacts.email,
          geography: contacts.geography,
          builderId: contacts.builderId,
          builderName: builders.name,
        })
        .from(contacts)
        .leftJoin(builders, eq(contacts.builderId, builders.id))
        .where(eq(contacts.orgId, org.id))
        .orderBy(asc(contacts.lastName), asc(contacts.firstName))
    : [];

  const orgContacts: ExistingContactOption[] = orgContactRows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
    title: r.title,
    email: r.email,
    geography: r.geography,
    builderId: r.builderId,
    builderName: r.builderName,
  }));

  return { groups: Array.from(map.values()), leadOptions, orgContacts };
}
