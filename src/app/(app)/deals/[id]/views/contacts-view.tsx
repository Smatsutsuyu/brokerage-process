import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, builders, contacts, dealBuyers, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import { ContactsTable, type BuyerRow } from "./contacts-table";
import type { LeadOption } from "./lead-picker";
import type { ExistingContactOption } from "./pick-existing-contact-modal";

type ContactsViewProps = {
  dealId: string;
};

export async function ContactsView({ dealId }: ContactsViewProps) {
  const org = await getCurrentOrg();
  // One row per (builder × contact). LEFT JOIN on contacts so a builder with
  // no contacts still surfaces — the deal_buyer association alone says "this
  // company is on the deal," which is meaningful even before names are added.
  // Lead user → users → auth_user, both LEFT so an unassigned lead is fine.
  const rows = await db
    .select({
      dealBuyerId: dealBuyers.id,
      tier: dealBuyers.tier,
      omSentAt: dealBuyers.omSentAt,
      calledAt: dealBuyers.calledAt,
      comments: dealBuyers.comments,
      builderId: builders.id,
      builderName: builders.name,
      builderClassification: builders.classification,
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

  const buyerRows: BuyerRow[] = rows.map((r) => ({
    key: `${r.dealBuyerId}-${r.contactId ?? "no-contact"}`,
    dealBuyerId: r.dealBuyerId,
    tier: r.tier,
    builderId: r.builderId,
    builderName: r.builderName,
    builderClassification: r.builderClassification,
    contactId: r.contactId,
    contactFirstName: r.contactFirstName,
    contactLastName: r.contactLastName,
    contactName:
      r.contactFirstName || r.contactLastName
        ? `${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim()
        : null,
    contactTitle: r.contactTitle,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    contactNotes: r.contactNotes,
    leadUserId: r.leadUserId,
    leadName: r.leadName,
    omSent: r.omSentAt !== null,
    called: r.calledAt !== null,
    // Prefer per-contact notes when present; fall back to deal_buyer comments
    // (used when a builder is on the deal but has no individual contact yet).
    comments: r.contactNotes ?? r.comments,
  }));

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
  // Joining the optional builder so the picker can show "Bob — Lennar" or
  // "Bob — standalone" without an extra round-trip.
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

  return (
    <ContactsTable
      dealId={dealId}
      rows={buyerRows}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}
