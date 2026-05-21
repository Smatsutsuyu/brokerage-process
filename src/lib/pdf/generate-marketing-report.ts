import "server-only";

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

import { MarketingReportDoc, type MarketingReportRow } from "./marketing-report";

// Single source of truth for "render the per-deal Marketing Report PDF
// to bytes." Called from two places today:
//
//   1. /api/deals/[id]/marketing-report.pdf — streams the bytes inline
//      for browser preview / download (the buttons throughout the app).
//
//   2. src/lib/email/generators.ts — used when the Marketing Report is
//      attached to a blast email via kind: "generated", so recipients
//      get the actual PDF bytes attached rather than a clickable URL.
//
// Org-scoped lookup so a forged dealId from a sibling org returns null
// rather than rendering data the caller shouldn't see.

export type MarketingReportPdf = {
  filename: string;
  // PDF bytes. Use directly as Resend attachment.content or stream as
  // a Response body. Buffer (Node), not Uint8Array, to match what
  // sendEmail's attachment shape expects.
  content: Buffer;
};

function formatDateLabel(d: Date): string {
  // "March 2026" — matches the PDF's header subline.
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export async function generateMarketingReportPdf(input: {
  dealId: string;
  orgId: string;
}): Promise<MarketingReportPdf | null> {
  const [deal] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, input.orgId)))
    .limit(1);
  if (!deal) return null;

  // Same query the API route uses — pull every dealBuyer for this deal
  // that has at least one contact on the deal. EXISTS keeps it one-row-
  // per-builder without DISTINCT and mirrors the cards-UI behavior of
  // hiding builder rows with no attached contacts.
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
        eq(dealBuyers.dealId, input.dealId),
        sql`EXISTS (
          SELECT 1
          FROM ${dealContacts}
          INNER JOIN ${contacts} ON ${contacts.id} = ${dealContacts.contactId}
          WHERE ${dealContacts.dealId} = ${input.dealId}
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

  const content = await renderToBuffer(
    MarketingReportDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      rows: reportRows,
    }),
  );

  // "Deal Name - Marketing Report.pdf". Strip only filesystem-illegal
  // characters so the deal name reads naturally as the attachment name
  // in the recipient's mail client.
  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName
    ? `${safeName} - Marketing Report.pdf`
    : "Marketing Report.pdf";

  return { filename, content };
}
