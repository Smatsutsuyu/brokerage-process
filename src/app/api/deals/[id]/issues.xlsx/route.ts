// Issues Excel export. Per-deal single-sheet workbook of every issue on
// the deal with status, priority, assignee, identified/resolved dates.
// Assignee name resolves through the Deal Team polymorphic identity
// chain (user > contact > free-text), same as issues-view.tsx and the
// DD Tracking PDF.

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";

import { db } from "@/db";
import {
  authUser,
  contacts,
  dealTeamMembers,
  deals,
  issues,
  users,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resolveDealTeamMemberName } from "@/lib/deal-team-name";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatShort(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
      assigneeTeamMemberId: issues.assigneeTeamMemberId,
      dtmUserId: dealTeamMembers.userId,
      dtmContactId: dealTeamMembers.contactId,
      dtmFreeName: dealTeamMembers.name,
      dtmUserName: authUser.name,
      dtmUserEmail: authUser.email,
      dtmContactFirst: contacts.firstName,
      dtmContactLast: contacts.lastName,
      identifiedAt: issues.identifiedAt,
      resolvedAt: issues.resolvedAt,
    })
    .from(issues)
    // Same tightened join used in issues-view.tsx: a forged
    // assigneeTeamMemberId resolves to null instead of leaking a foreign
    // member's name.
    .leftJoin(
      dealTeamMembers,
      and(
        eq(dealTeamMembers.id, issues.assigneeTeamMemberId),
        eq(dealTeamMembers.dealId, issues.dealId),
        eq(dealTeamMembers.orgId, issues.orgId),
      ),
    )
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(and(eq(issues.dealId, deal.id), eq(issues.orgId, org.id)))
    .orderBy(asc(issues.identifiedAt));

  const aoa: (string | number)[][] = [
    ["Title", "Description", "Status", "Priority", "Assignee", "Identified", "Resolved"],
  ];
  for (const r of rows) {
    const assignee = r.assigneeTeamMemberId
      ? resolveDealTeamMemberName({
          userId: r.dtmUserId,
          contactId: r.dtmContactId,
          freeName: r.dtmFreeName,
          userName: r.dtmUserName,
          userEmail: r.dtmUserEmail,
          contactFirst: r.dtmContactFirst,
          contactLast: r.dtmContactLast,
        })
      : "Unassigned";
    aoa.push([
      r.title,
      r.description ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      PRIORITY_LABEL[r.priority] ?? r.priority,
      assignee,
      formatShort(r.identifiedAt),
      formatShort(r.resolvedAt),
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable column widths: title wider, description widest, dates narrow.
  sheet["!cols"] = [
    { wch: 40 }, // Title
    { wch: 60 }, // Description
    { wch: 12 }, // Status
    { wch: 10 }, // Priority
    { wch: 24 }, // Assignee
    { wch: 14 }, // Identified
    { wch: 14 }, // Resolved
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Issues");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName ? `${safeName} - Issues.xlsx` : "Issues.xlsx";

  const headers = new Headers();
  headers.set(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
