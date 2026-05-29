// Internal Marketing Report PDF route. Sister of marketing-report.pdf
// — denser, internal-only view of the Contacts tab (per-builder header
// + comments + per-contact name/title/email/phone, grouped by tier).

import { NextResponse } from "next/server";

import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { generateInternalMarketingReportPdf } from "@/lib/pdf/generate-internal-marketing-report";

// Force Node runtime — React-PDF needs Node APIs that aren't in Edge.
export const runtime = "nodejs";

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
  const pdf = await generateInternalMarketingReportPdf({ dealId: id, orgId: org.id });
  if (!pdf) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${pdf.filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(pdf.content as unknown as BodyInit, { status: 200, headers });
}
