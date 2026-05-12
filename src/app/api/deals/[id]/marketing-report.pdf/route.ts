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
import { and, asc, eq } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { builders, dealBuyers, deals } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  MarketingReportDoc,
  type MarketingReportRow,
} from "@/lib/pdf/marketing-report";

// Force Node runtime — React-PDF needs Node APIs that aren't in Edge.
export const runtime = "nodejs";

async function bannerToDataUri(pathname: string | null): Promise<string | null> {
  if (!pathname) return null;
  try {
    const blob = await get(pathname, { access: "private" });
    if (!blob) return null;
    // Stream → buffer → base64. Banner blobs are <5 MB so memory is fine.
    const arrayBuffer = await new Response(blob.stream).arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    // Best-effort MIME type — Vercel Blob doesn't include contentType in
    // get() response, so we infer from the pathname extension and default
    // to jpeg (most common for hero banners).
    const ext = pathname.split(".").pop()?.toLowerCase() ?? "jpeg";
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.warn("[marketing-report] failed to fetch banner; using fallback", err);
    return null;
  }
}

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
      bannerImagePath: deals.bannerImagePath,
    })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Pull every dealBuyer for this deal joined to its builder. Tier + the
  // freeform comments column drive the table rows.
  const rows = await db
    .select({
      tier: dealBuyers.tier,
      comments: dealBuyers.comments,
      builderName: builders.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(builders.id, dealBuyers.builderId))
    .where(eq(dealBuyers.dealId, id))
    .orderBy(asc(builders.name));

  const reportRows: MarketingReportRow[] = rows.map((r) => ({
    builderName: r.builderName,
    tier: r.tier,
    comments: r.comments?.trim() ?? "",
  }));

  const bannerDataUri = await bannerToDataUri(deal.bannerImagePath);

  const buffer = await renderToBuffer(
    MarketingReportDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      bannerDataUri,
      rows: reportRows,
    }),
  );

  // Slug the filename so it lands cleanly in the user's downloads.
  const slug = deal.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filename = `${slug || "marketing-report"}-${new Date().toISOString().slice(0, 10)}.pdf`;

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  // Cast: Buffer is a Uint8Array subclass at runtime, but TS's Web Response
  // BodyInit signature in this Next.js version doesn't accept it directly.
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
