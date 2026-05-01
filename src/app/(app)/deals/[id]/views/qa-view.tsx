import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { qaItems } from "@/db/schema";

import { QaList, type QaRow } from "./qa-list";

type QaViewProps = {
  dealId: string;
};

export async function QaView({ dealId }: QaViewProps) {
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

  return <QaList dealId={dealId} items={items} />;
}
