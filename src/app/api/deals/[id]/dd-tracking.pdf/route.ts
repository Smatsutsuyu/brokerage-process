// Due Diligence Tracking PDF. Per-deal combined report covering, in
// order: 7 milestone dates (lifted from the Phase 4 checklist items
// flagged dateField=true), issues grouped by status, deal team
// (owner/broker/buyer subteams), consultants. Streamed inline for the
// in-browser preview pattern; attached as bytes at send time via
// src/lib/email/generators.ts.

import { NextResponse } from "next/server";

import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { generateDdTrackingPdf } from "@/lib/pdf/generate-dd-tracking";

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
  const result = await generateDdTrackingPdf({ dealId: id, orgId: org.id });
  if (!result) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${result.filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(result.content as unknown as BodyInit, {
    status: 200,
    headers,
  });
}
