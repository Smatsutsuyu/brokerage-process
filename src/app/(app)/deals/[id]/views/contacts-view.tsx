import { eq } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealBuyers, users } from "@/db/schema";

import { ContactsTable, type BuyerRow } from "./contacts-table";

type ContactsViewProps = {
  dealId: string;
};

export async function ContactsView({ dealId }: ContactsViewProps) {
  // One row per (builder × contact). LEFT JOIN on contacts so a builder with
  // no contacts still surfaces — the deal_buyer association alone says "this
  // company is on the deal," which is meaningful even before names are added.
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
      leadFirstName: users.firstName,
      leadLastName: users.lastName,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(dealBuyers.builderId, builders.id))
    .leftJoin(contacts, eq(contacts.builderId, builders.id))
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
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
    leadName:
      r.leadFirstName || r.leadLastName
        ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
        : null,
    omSent: r.omSentAt !== null,
    called: r.calledAt !== null,
    // Prefer per-contact notes when present; fall back to deal_buyer comments
    // (used when a builder is on the deal but has no individual contact yet).
    comments: r.contactNotes ?? r.comments,
  }));

  return <ContactsTable dealId={dealId} rows={buyerRows} />;
}
