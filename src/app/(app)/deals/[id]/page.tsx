import { notFound } from "next/navigation";
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  checklistCategories,
  checklistItems,
  consultants,
  contacts,
  dealBuyers,
  deals,
  issues,
  qaItems,
} from "@/db/schema";
import { FeedbackZone } from "@/components/feedback/feedback-zone";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import { DealHeader } from "./deal-header";
import { DealTabs } from "./deal-tabs";
import { ChecklistView } from "./views/checklist-view";
import { ConsultantsView } from "./views/consultants-view";
import { ContactsView } from "./views/contacts-view";
import { IssuesView } from "./views/issues-view";
import { QaView } from "./views/qa-view";

const PHASE_LABELS: Record<string, string> = {
  phase_1: "Phase 1",
  phase_2: "Phase 2",
  phase_3: "Phase 3",
  phase_4: "Phase 4",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getCurrentOrg();
  if (!org) notFound();

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), eq(deals.orgId, org.id)),
  });
  if (!deal) notFound();

  const categories = await db
    .select({
      id: checklistCategories.id,
      phase: checklistCategories.phase,
      name: checklistCategories.name,
      sortOrder: checklistCategories.sortOrder,
    })
    .from(checklistCategories)
    .where(eq(checklistCategories.dealId, id))
    .orderBy(checklistCategories.phase, checklistCategories.sortOrder);

  const items = await db
    .select({
      id: checklistItems.id,
      categoryId: checklistItems.categoryId,
      name: checklistItems.name,
      optional: checklistItems.optional,
      completed: checklistItems.completed,
      sortOrder: checklistItems.sortOrder,
    })
    .from(checklistItems)
    .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
    .where(eq(checklistCategories.dealId, id))
    .orderBy(checklistItems.sortOrder);

  const [contactsCount] = await db
    .select({ n: count() })
    .from(contacts)
    .innerJoin(dealBuyers, eq(dealBuyers.builderId, contacts.builderId))
    .where(eq(dealBuyers.dealId, id));

  const [qaTotal] = await db
    .select({
      total: count(),
      approved: sql<number>`count(*) filter (where ${qaItems.approved} = true)::int`,
    })
    .from(qaItems)
    .where(eq(qaItems.dealId, id));

  const [issuesOpen] = await db
    .select({
      open: sql<number>`count(*) filter (where ${issues.status} = 'open')::int`,
    })
    .from(issues)
    .where(eq(issues.dealId, id));

  const [consultantsFilled] = await db
    .select({ n: count() })
    .from(consultants)
    .where(eq(consultants.dealId, id));

  const totalItems = items.length;
  const doneItems = items.filter((i) => i.completed).length;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const counts = {
    checklist: { done: doneItems, total: totalItems },
    contacts: contactsCount?.n ?? 0,
    qa: { approved: Number(qaTotal?.approved ?? 0), total: Number(qaTotal?.total ?? 0) },
    issuesOpen: Number(issuesOpen?.open ?? 0),
    consultants: consultantsFilled?.n ?? 0,
  };

  return (
    <>
      <FeedbackZone section="sidebar">
        <Sidebar activeDealId={id} />
      </FeedbackZone>
      <main className="bg-brand-bg flex-1 overflow-y-auto px-10 py-8">
        <FeedbackZone section="deal-header">
          <DealHeader
            name={deal.name}
            subtitle={[
              [deal.city, deal.state].filter(Boolean).join(", ") || "No location",
              `${counts.checklist.done}/${counts.checklist.total} checklist`,
              `${counts.contacts} contacts`,
              `${counts.qa.approved}/${counts.qa.total} Q&A`,
              `${counts.issuesOpen} open issues`,
            ].join(" · ")}
            statusLabel={PHASE_LABELS[deal.status] ?? deal.status}
            priority={deal.priority}
            progressPct={pct}
            deal={{
              dealId: deal.id,
              name: deal.name,
              units: deal.units,
              city: deal.city,
              state: deal.state,
              type: deal.type,
              status: deal.status,
              priority: deal.priority,
              notes: deal.notes,
            }}
          />
        </FeedbackZone>
        <DealTabs counts={counts}>
          {{
            checklist: (
              <FeedbackZone section="deal-checklist">
                <ChecklistView dealId={id} categories={categories} items={items} />
              </FeedbackZone>
            ),
            contacts: (
              <FeedbackZone section="deal-contacts">
                <ContactsView dealId={id} />
              </FeedbackZone>
            ),
            qa: (
              <FeedbackZone section="deal-qa">
                <QaView dealId={id} />
              </FeedbackZone>
            ),
            issues: (
              <FeedbackZone section="deal-issues">
                <IssuesView dealId={id} />
              </FeedbackZone>
            ),
            consultants: (
              <FeedbackZone section="deal-consultants">
                <ConsultantsView dealId={id} />
              </FeedbackZone>
            ),
          }}
        </DealTabs>
      </main>
    </>
  );
}

