// Q&A File PDF generator. Streams a per-deal PDF for buyer
// distribution: numbered list of approved questions (bold) with their
// answers (regular weight) underneath. Pending items are excluded —
// only approved Q&A leaves the firm.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { deals, qaItems } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { QaFileDoc, type QaFileRow } from "@/lib/pdf/qa-file";

export const runtime = "nodejs";

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [deal] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      question: qaItems.question,
      answer: qaItems.answer,
    })
    .from(qaItems)
    .where(
      and(
        eq(qaItems.dealId, id),
        eq(qaItems.orgId, org.id),
        eq(qaItems.approved, true),
      ),
    )
    .orderBy(qaItems.createdAt);

  const reportRows: QaFileRow[] = rows.map((r) => ({
    question: r.question,
    answer: r.answer,
  }));

  const buffer = await renderToBuffer(
    QaFileDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      rows: reportRows,
    }),
  );

  // Filename pattern: "Deal Name - Q&A File.pdf". Matches the Marketing
  // Report convention — preserves the deal name's natural casing,
  // strips only Windows-illegal characters.
  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName ? `${safeName} - Q&A File.pdf` : "Q&A File.pdf";

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
