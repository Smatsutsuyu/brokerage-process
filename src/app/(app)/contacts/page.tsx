import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealBuyers, deals } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { ContactsList, type ContactRow } from "./contacts-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contacts — Lakebridge Capital",
};

export default async function ContactsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  // Pull contacts with their (optional) builder name. Standalone contacts
  // (no builder) get null builderId.
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      phone: contacts.phone,
      geography: contacts.geography,
      notes: contacts.notes,
      builderId: contacts.builderId,
      builderName: builders.name,
      builderClassification: builders.classification,
    })
    .from(contacts)
    .leftJoin(builders, eq(contacts.builderId, builders.id))
    .where(eq(contacts.orgId, org.id))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));

  // Pull every (builder, deal) association for the org in one shot, then
  // group client-side. Cheaper than N queries (one per contact); at
  // Lakebridge's expected scale (<500 contacts × <50 deals) this is well
  // under a millisecond of grouping work.
  const builderDealRows = await db
    .select({
      builderId: dealBuyers.builderId,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(dealBuyers)
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(eq(dealBuyers.orgId, org.id))
    .orderBy(asc(deals.name));

  const dealsByBuilder = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of builderDealRows) {
    const list = dealsByBuilder.get(r.builderId) ?? [];
    list.push({ id: r.dealId, name: r.dealName });
    dealsByBuilder.set(r.builderId, list);
  }

  const builderOptions = await db
    .select({
      id: builders.id,
      name: builders.name,
      classification: builders.classification,
    })
    .from(builders)
    .where(eq(builders.orgId, org.id))
    .orderBy(asc(builders.name));

  const contactRows: ContactRow[] = rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
    title: r.title,
    email: r.email,
    phone: r.phone,
    geography: r.geography,
    notes: r.notes,
    builderId: r.builderId,
    builderName: r.builderName,
    builderClassification: r.builderClassification,
    deals: r.builderId ? (dealsByBuilder.get(r.builderId) ?? []) : [],
  }));

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">Contacts</h1>
          <p className="text-[13px] text-gray-400">
            Org-wide directory of buyer-side contacts. Contacts can exist standalone or be tied to
            a builder. Use {"“"}Import from Excel{"”"} to bulk-load from a marketing list.
          </p>
        </header>
        <ContactsList contacts={contactRows} builders={builderOptions} />
      </main>
    </>
  );
}
