import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { checklistCategories, checklistItems, qaItems } from "@/db/schema";

import { QaList, type QaRow } from "./qa-list";

type QaViewProps = {
  dealId: string;
};

export async function QaView({ dealId }: QaViewProps) {
  // The Q&A File checklist row, whose uploads the tab's Send Q&A button
  // offers as attachments. Same exact-name match the checklist row's
  // isQaFileItem uses, so both entry points attach the same files.
  const qaFileRow = (
    await db
      .select({ id: checklistItems.id, name: checklistItems.name })
      .from(checklistItems)
      .innerJoin(checklistCategories, eq(checklistItems.categoryId, checklistCategories.id))
      .where(and(eq(checklistCategories.dealId, dealId)))
  ).find((r) => r.name.trim().toLowerCase() === "q&a file");

  const rows = await db
    .select({
      id: qaItems.id,
      question: qaItems.question,
      answer: qaItems.answer,
      approved: qaItems.approved,
      approvedAt: qaItems.approvedAt,
      createdAt: qaItems.createdAt,
    })
    .from(qaItems)
    .where(eq(qaItems.dealId, dealId))
    .orderBy(asc(qaItems.createdAt));

  const items: QaRow[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    approved: r.approved,
    approvedAt: r.approvedAt?.toISOString() ?? null,
  }));

  return <QaList dealId={dealId} items={items} qaFileItemId={qaFileRow?.id ?? null} />;
}
