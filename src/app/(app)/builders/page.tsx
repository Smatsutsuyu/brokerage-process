import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { builders, contacts, dealBuyers, dealContacts, deals } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { BuildersList, type BuilderRow } from "./builders-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Builders — Land Advisors Portal",
};

export default async function BuildersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  const builderRows = await db
    .select({
      id: builders.id,
      name: builders.name,
      classification: builders.classification,
      notes: builders.notes,
    })
    .from(builders)
    .where(eq(builders.orgId, org.id))
    .orderBy(asc(builders.name));

  // Pull every (builder, contact) row + every (builder, deal) row for the
  // org in one shot, then group client-side. Two queries vs N — fine at
  // Lakebridge's scale (<200 builders × <50 deals × <500 contacts).
  const contactRows = await db
    .select({
      builderId: contacts.builderId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
    })
    .from(contacts)
    .where(eq(contacts.orgId, org.id))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));

  // Only count a builder as "on a deal" when it has at least one contact
  // attached on that deal. The EXISTS filter mirrors the orphan-filter
  // pattern used by the Marketing Report PDF — a dealBuyers row without
  // attached contacts is invisible bookkeeping (tier/lead retention) and
  // shouldn't surface in the directory's "on N deals" count.
  const dealRows = await db
    .select({
      builderId: dealBuyers.builderId,
      dealId: deals.id,
      dealName: deals.name,
    })
    .from(dealBuyers)
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(
      and(
        eq(dealBuyers.orgId, org.id),
        sql`EXISTS (
          SELECT 1
          FROM ${dealContacts} dc
          INNER JOIN ${contacts} c ON c.id = dc.contact_id
          WHERE dc.deal_id = ${dealBuyers.dealId}
            AND c.builder_id = ${dealBuyers.builderId}
        )`,
      ),
    )
    .orderBy(asc(deals.name));

  const contactsByBuilder = new Map<
    string,
    Array<{ id: string; fullName: string; title: string | null; email: string | null }>
  >();
  for (const c of contactRows) {
    if (!c.builderId) continue;
    const list = contactsByBuilder.get(c.builderId) ?? [];
    list.push({
      id: c.id,
      fullName: `${c.firstName} ${c.lastName}`.trim(),
      title: c.title,
      email: c.email,
    });
    contactsByBuilder.set(c.builderId, list);
  }

  const dealsByBuilder = new Map<string, Array<{ id: string; name: string }>>();
  for (const d of dealRows) {
    const list = dealsByBuilder.get(d.builderId) ?? [];
    list.push({ id: d.dealId, name: d.dealName });
    dealsByBuilder.set(d.builderId, list);
  }

  const rows: BuilderRow[] = builderRows.map((b) => ({
    id: b.id,
    name: b.name,
    classification: b.classification,
    notes: b.notes,
    contacts: contactsByBuilder.get(b.id) ?? [],
    deals: dealsByBuilder.get(b.id) ?? [],
  }));

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">Builders</h1>
          <p className="text-[13px] text-gray-400">
            Org-wide directory of builder companies. Edit classification, see all contacts at a
            builder, and see which deals they&rsquo;re on. Builders are added to a deal via the
            deal&rsquo;s Contacts tab.
          </p>
        </header>
        <BuildersList builders={rows} />
      </main>
    </>
  );
}
