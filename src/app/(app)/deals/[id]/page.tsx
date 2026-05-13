import { notFound, redirect } from "next/navigation";
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  checklistCategories,
  checklistItemLinks,
  checklistItems,
  consultants,
  dealContacts,
  dealTeamMembers,
  deals,
  documents,
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
import {
  PrototypeAView,
  PrototypeBView,
  PrototypeCView,
  PrototypeDView,
} from "./views/prototypes/prototype-views";
import { QaView } from "./views/qa-view";
import { TeamView } from "./views/team-view";


export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getCurrentOrg();
  // Cookie present but session invalid (rotated secret, deleted user, disabled
  // member) — bounce to sign-in instead of showing a confusing 404.
  if (!org) redirect("/sign-in");

  // All queries are independent — fire them in parallel so total latency is
  // ~1 RTT instead of 7. The deal existence check happens after the batch so
  // we don't need a serial dependency just to short-circuit on notFound.
  const [
    deal,
    categories,
    items,
    contactsCountRow,
    qaTotalRow,
    issuesOpenRow,
    consultantsFilledRow,
    teamCountRow,
    documentRows,
    linkRows,
  ] = await Promise.all([
      db.query.deals.findFirst({
        where: and(eq(deals.id, id), eq(deals.orgId, org.id)),
      }),
      db
        .select({
          id: checklistCategories.id,
          phase: checklistCategories.phase,
          name: checklistCategories.name,
          sortOrder: checklistCategories.sortOrder,
        })
        .from(checklistCategories)
        .where(eq(checklistCategories.dealId, id))
        .orderBy(checklistCategories.phase, checklistCategories.sortOrder),
      db
        .select({
          id: checklistItems.id,
          categoryId: checklistItems.categoryId,
          name: checklistItems.name,
          optional: checklistItems.optional,
          completed: checklistItems.completed,
          sortOrder: checklistItems.sortOrder,
          notes: checklistItems.notes,
          trackedDate: checklistItems.trackedDate,
        })
        .from(checklistItems)
        .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
        .where(eq(checklistCategories.dealId, id))
        .orderBy(checklistItems.sortOrder),
      db
        .select({ n: count() })
        .from(dealContacts)
        .where(eq(dealContacts.dealId, id))
        .then((r) => r[0]),
      db
        .select({
          total: count(),
          approved: sql<number>`count(*) filter (where ${qaItems.approved} = true)::int`,
        })
        .from(qaItems)
        .where(eq(qaItems.dealId, id))
        .then((r) => r[0]),
      db
        .select({
          open: sql<number>`count(*) filter (where ${issues.status} = 'open')::int`,
        })
        .from(issues)
        .where(eq(issues.dealId, id))
        .then((r) => r[0]),
      db
        .select({ n: count() })
        .from(consultants)
        .where(eq(consultants.dealId, id))
        .then((r) => r[0]),
      db
        .select({ n: count() })
        .from(dealTeamMembers)
        .where(eq(dealTeamMembers.dealId, id))
        .then((r) => r[0]),
      // All checklist-attached docs for this deal. Sorted by version desc so
      // the JS-side dedupe below trivially keeps the latest per item without
      // needing DISTINCT ON. Only ~37 items max, so over-fetching is fine.
      db
        .select({
          id: documents.id,
          checklistItemId: documents.checklistItemId,
          name: documents.name,
          version: documents.version,
          mimeType: documents.mimeType,
          uploadedAt: documents.uploadedAt,
        })
        .from(documents)
        .where(
          and(eq(documents.dealId, id), isNotNull(documents.checklistItemId)),
        )
        .orderBy(desc(documents.version)),
      // External-link attachments per checklist item. Joined to
      // checklist_categories so we can scope by deal in one query rather
      // than collecting item ids first then doing a second inArray pass.
      db
        .select({
          id: checklistItemLinks.id,
          checklistItemId: checklistItemLinks.checklistItemId,
          url: checklistItemLinks.url,
          label: checklistItemLinks.label,
          sortOrder: checklistItemLinks.sortOrder,
          createdAt: checklistItemLinks.createdAt,
        })
        .from(checklistItemLinks)
        .innerJoin(
          checklistItems,
          eq(checklistItems.id, checklistItemLinks.checklistItemId),
        )
        .innerJoin(
          checklistCategories,
          eq(checklistCategories.id, checklistItems.categoryId),
        )
        .where(eq(checklistCategories.dealId, id))
        .orderBy(asc(checklistItemLinks.sortOrder), asc(checklistItemLinks.createdAt)),
    ]);

  if (!deal) notFound();

  const contactsCount = contactsCountRow;
  const qaTotal = qaTotalRow;
  const issuesOpen = issuesOpenRow;
  const consultantsFilled = consultantsFilledRow;

  const totalItems = items.length;
  const doneItems = items.filter((i) => i.completed).length;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Latest doc per checklist item. documentRows is already sorted version
  // desc, so the first entry seen for each itemId is the most recent. Plain
  // All docs per checklist item, newest first (the source query already
  // sorts by version desc, so we can append in iteration order). Plain
  // record-of-arrays for clean RSC→client serialization.
  const documentsByItemId: Record<
    string,
    Array<{
      id: string;
      name: string;
      version: number;
      mimeType: string | null;
      uploadedAt: string;
    }>
  > = {};
  for (const d of documentRows) {
    if (!d.checklistItemId) continue;
    const list = (documentsByItemId[d.checklistItemId] ??= []);
    list.push({
      id: d.id,
      name: d.name,
      version: d.version,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt.toISOString(),
    });
  }

  // Same shape for external links — bucket per item, ordered already by
  // sortOrder + createdAt from the query.
  const linksByItemId: Record<
    string,
    Array<{ id: string; url: string; label: string | null }>
  > = {};
  for (const lnk of linkRows) {
    const list = (linksByItemId[lnk.checklistItemId] ??= []);
    list.push({ id: lnk.id, url: lnk.url, label: lnk.label });
  }

  const counts = {
    checklist: { done: doneItems, total: totalItems },
    contacts: contactsCount?.n ?? 0,
    qa: { approved: Number(qaTotal?.approved ?? 0), total: Number(qaTotal?.total ?? 0) },
    issuesOpen: Number(issuesOpen?.open ?? 0),
    consultants: consultantsFilled?.n ?? 0,
    team: teamCountRow?.n ?? 0,
  };

  return (
    <>
      <FeedbackZone section="sidebar">
        <Sidebar activeDealId={id} />
      </FeedbackZone>
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <FeedbackZone section="deal-header" align="far">
          <DealHeader
            name={deal.name}
            subtitle={[
              [deal.city, deal.state].filter(Boolean).join(", ") || "No location",
              `${counts.checklist.done}/${counts.checklist.total} checklist`,
              `${counts.contacts} contacts`,
              `${counts.qa.approved}/${counts.qa.total} Q&A`,
              `${counts.issuesOpen} open issues`,
            ].join(" · ")}
            priority={deal.priority}
            progressPct={pct}
            deal={{
              dealId: deal.id,
              name: deal.name,
              units: deal.units,
              city: deal.city,
              state: deal.state,
              type: deal.type,
              priority: deal.priority,
              notes: deal.notes,
            }}
            hasBanner={Boolean(deal.bannerImagePath)}
          />
        </FeedbackZone>
        <DealTabs counts={counts}>
          {{
            checklist: (
              <FeedbackZone section="deal-checklist">
                <ChecklistView
                  dealId={id}
                  categories={categories}
                  items={items}
                  documentsByItemId={documentsByItemId}
                  linksByItemId={linksByItemId}
                  psaAttorney={{
                    name: deal.psaAttorneyName,
                    firm: deal.psaAttorneyFirm,
                    drafting: deal.psaDrafting,
                  }}
                />
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
            team: (
              <FeedbackZone section="deal-team">
                <TeamView dealId={id} />
              </FeedbackZone>
            ),
            "proto-a": <PrototypeAView dealId={id} />,
            "proto-b": <PrototypeBView dealId={id} />,
            "proto-c": <PrototypeCView dealId={id} />,
            "proto-d": <PrototypeDView dealId={id} />,
          }}
        </DealTabs>
      </main>
    </>
  );
}

