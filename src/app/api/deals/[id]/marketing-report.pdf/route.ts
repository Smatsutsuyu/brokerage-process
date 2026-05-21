// Marketing Report PDF route. Streams the per-deal Marketing Report as
// an inline-rendered PDF for browser preview. The actual data fetch +
// render lives in src/lib/pdf/generate-marketing-report.ts so the same
// rendering path can be reused by the email-blast handler when the
// Marketing Report is attached as kind: "generated".

import { NextResponse } from "next/server";

import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { generateMarketingReportPdf } from "@/lib/pdf/generate-marketing-report";

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
  const pdf = await generateMarketingReportPdf({ dealId: id, orgId: org.id });
  if (!pdf) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  // `inline` so the browser previews the PDF in the new tab the trigger
  // button opens, instead of forcing a download. The user can still save
  // from the inline viewer if they want a copy on disk.
  headers.set("Content-Disposition", `inline; filename="${pdf.filename}"`);
  headers.set("Cache-Control", "private, no-store");
  // Cast: Buffer is a Uint8Array subclass at runtime, but TS's Web Response
  // BodyInit signature in this Next.js version doesn't accept it directly.
  return new Response(pdf.content as unknown as BodyInit, { status: 200, headers });
}
