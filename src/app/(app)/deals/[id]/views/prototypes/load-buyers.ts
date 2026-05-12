import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  contacts,
  dealBuyers,
  dealContacts,
  users,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import type { LeadOption } from "../lead-picker";
import type { ExistingContactOption } from "../pick-existing-contact-modal";

export type Tier = "green" | "yellow" | "red" | "not_selected";
export type Classification = "private" | "public" | "developer";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  receivesCommunication: boolean;
};

// A "group" is one card in the Contacts UI. Either a builder's contacts
// (with the builder's tier/lead/etc. metadata) OR the synthetic
// "Unaffiliated" group for contacts on the deal that have no builder.
//
// kind === "builder": dealBuyer-derived metadata is populated. dealBuyerId
//   is non-null. Card shows tier, lead picker, called/OM-sent toggles.
// kind === "unaffiliated": no builder metadata. dealBuyerId is null. Card
//   just shows the contacts list — no tier/lead/etc. (would be meaningless
//   without a builder to attach them to).
export type BuyerGroup =
  | {
      kind: "builder";
      // Stable key for the group — maps to the dealBuyer row.
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
    }
  | {
      kind: "unaffiliated";
      // Stable key — fixed string since there's only ever one of these per
      // deal. UI uses it to dedupe and as a React key.
      dealBuyerId: "unaffiliated";
      contacts: ContactRow[];
    };

export type BuyerData = {
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
  // Org-wide contacts directory for the "+ Existing Contact" picker. Loaded
  // once here so each prototype view doesn't re-query.
  orgContacts: ExistingContactOption[];
};

// Loader for the deal's contact groups. Reads from deal_contacts (explicit
// per-person assignment), joins through to the contact and (optionally)
// their builder, and pulls per-builder metadata from deal_buyers when a
// builder is present. A builder card only appears when at least one of its
// contacts is on the deal — purely query-derived, not stored.
export async function loadBuyers(dealId: string): Promise<BuyerData> {
  const org = await getCurrentOrg();

  // One row per (deal_contact, contact, [builder], [dealBuyer]). Standalone
  // contacts have null builder/dealBuyer columns. Builder ordering puts
  // null (Unaffiliated) last via NULLS LAST.
  const rows = await db
    .select({
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      contactNotes: contacts.notes,
      contactReceivesCommunication: contacts.receivesCommunication,
      builderId: builders.id,
      builderName: builders.name,
      classification: builders.classification,
      dealBuyerId: dealBuyers.id,
      tier: dealBuyers.tier,
      omSentAt: dealBuyers.omSentAt,
      calledAt: dealBuyers.calledAt,
      comments: dealBuyers.comments,
      leadUserId: dealBuyers.leadUserId,
      leadName: authUser.name,
    })
    .from(dealContacts)
    .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .leftJoin(
      dealBuyers,
      // Scope to THIS deal's dealBuyers row — without the dealId predicate,
      // a builder on N deals causes N joined rows per contact, which the
      // bucket-by-dealBuyerId logic below turns into N duplicate cards.
      and(
        eq(dealBuyers.builderId, contacts.builderId),
        eq(dealBuyers.dealId, dealId),
      ),
    )
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(dealContacts.dealId, dealId))
    .orderBy(builders.name, contacts.lastName, contacts.firstName);

  // Bucket rows into groups. Key is dealBuyerId for builder groups,
  // "unaffiliated" for the standalone bucket.
  const map = new Map<string, BuyerGroup>();
  let unaffiliated: Extract<BuyerGroup, { kind: "unaffiliated" }> | null = null;

  for (const r of rows) {
    const contact: ContactRow = {
      id: r.contactId,
      firstName: r.contactFirstName,
      lastName: r.contactLastName,
      fullName: `${r.contactFirstName} ${r.contactLastName}`.trim(),
      title: r.contactTitle,
      email: r.contactEmail,
      phone: r.contactPhone,
      notes: r.contactNotes,
      receivesCommunication: r.contactReceivesCommunication,
    };

    if (r.builderId && r.dealBuyerId && r.builderName && r.classification && r.tier) {
      let g = map.get(r.dealBuyerId);
      if (!g) {
        g = {
          kind: "builder",
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
      // Type narrowing — at this point g is the builder variant.
      if (g.kind === "builder") g.contacts.push(contact);
    } else {
      // Standalone — bucket into the synthetic Unaffiliated group.
      if (!unaffiliated) {
        unaffiliated = { kind: "unaffiliated", dealBuyerId: "unaffiliated", contacts: [] };
      }
      unaffiliated.contacts.push(contact);
    }
  }

  const groups: BuyerGroup[] = Array.from(map.values());
  if (unaffiliated) groups.push(unaffiliated);

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

  // Org-wide contacts directory feeds the "Add Existing Contact" picker.
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

  return { groups, leadOptions, orgContacts };
}
