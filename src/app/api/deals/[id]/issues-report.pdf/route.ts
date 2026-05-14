// Issues Report PDF generator. Streams a per-deal PDF for the Phase 4
// bi-weekly DD rhythm: status summary at top, then issues grouped by
// open / in-progress / resolved with priority chips.
//
// Pulls from `issues` + joins assignedUser through users + auth_user for
// the "Assigned to" column. Order: status ASC (the doc's group order),
// priority urgency desc, then identified date.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, deals, issues, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { IssuesReportDoc, type IssuesReportRow } from "@/lib/pdf/issues-report";

export const runtime = "nodejs";

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
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
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      assignedUserName: authUser.name,
      assignedUserEmail: authUser.email,
      identifiedAt: issues.identifiedAt,
    })
    .from(issues)
    .leftJoin(users, eq(users.id, issues.assignedUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(and(eq(issues.dealId, id), eq(issues.orgId, org.id)))
    .orderBy(issues.identifiedAt);

  const reportRows: IssuesReportRow[] = rows.map((r) => ({
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assignedName: r.assignedUserName || r.assignedUserEmail || null,
    identifiedDate: formatShortDate(r.identifiedAt),
  }));

  const buffer = await renderToBuffer(
    IssuesReportDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      rows: reportRows,
    }),
  );

  // Filename pattern: "Deal Name - Issues Report.pdf". Strip only
  // characters illegal in Windows / cross-platform filenames so the deal
  // name reads naturally in the user's downloads. Matches the Marketing
  // Report convention.
  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName ? `${safeName} - Issues Report.pdf` : "Issues Report.pdf";

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
