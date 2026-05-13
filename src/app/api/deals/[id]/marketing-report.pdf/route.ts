// Marketing Report PDF generator. Streams a per-deal PDF matching
// Chris's example template (banner + builder/comments table grouped by
// tier + Land Advisors footer).
//
// Data source is dealBuyers (one row per builder on the deal) — NOT
// deal_contacts. Per-builder tier + interest comments are what Chris's
// recipients care about; individual contact info doesn't appear in the
// example PDF.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  builders,
  contacts,
  dealBuyers,
  dealContacts,
  deals,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  MarketingReportDoc,
  type MarketingReportRow,
} from "@/lib/pdf/marketing-report";

// Force Node runtime — React-PDF needs Node APIs that aren't in Edge.
export const runtime = "nodejs";

function formatDateLabel(d: Date): string {
  // "March 2026" — matches Chris's example header.
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
    .select({
      id: deals.id,
      name: deals.name,
    })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Pull every dealBuyer for this deal that has at least one contact on
  // the deal. Mirrors the cards-UI behavior: a builder card disappears
  // when its last contact is removed (the dealBuyer row persists for
  // tier/lead retention but is hidden), so the PDF should drop those too.
  // EXISTS subquery keeps the result one-row-per-builder without DISTINCT.
  const rows = await db
    .select({
      tier: dealBuyers.tier,
      comments: dealBuyers.comments,
      builderName: builders.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(builders.id, dealBuyers.builderId))
    .where(
      and(
        eq(dealBuyers.dealId, id),
        sql`EXISTS (
          SELECT 1
          FROM ${dealContacts}
          INNER JOIN ${contacts} ON ${contacts.id} = ${dealContacts.contactId}
          WHERE ${dealContacts.dealId} = ${id}
            AND ${contacts.builderId} = ${dealBuyers.builderId}
        )`,
      ),
    )
    .orderBy(asc(builders.name));

  const reportRows: MarketingReportRow[] = rows.map((r) => ({
    builderName: r.builderName,
    tier: r.tier,
    comments: r.comments?.trim() ?? "",
  }));

  const buffer = await renderToBuffer(
    MarketingReportDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      rows: reportRows,
    }),
  );

  // Filename pattern: "Deal Name - Marketing Report.pdf". Strip only
  // characters that are illegal in Windows / cross-platform filenames so
  // the deal name reads naturally in the user's downloads.
  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName
    ? `${safeName} - Marketing Report.pdf`
    : "Marketing Report.pdf";

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  // Cast: Buffer is a Uint8Array subclass at runtime, but TS's Web Response
  // BodyInit signature in this Next.js version doesn't accept it directly.
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
