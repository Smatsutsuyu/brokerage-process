// Due Diligence Tracking PDF. Per-deal combined report covering, in
// order: 7 milestone dates (lifted from the Phase 4 checklist items
// flagged dateField=true), issues grouped by status, deal team
// (owner/broker/buyer subteams), consultants. Streamed inline for the
// in-browser preview pattern.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  checklistCategories,
  checklistItems,
  consultants,
  contacts,
  dealTeamMembers,
  deals,
  issues,
  users,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  DdTrackingDoc,
  type ConsultantRow,
  type IssueRow,
  type MilestoneRow,
  type TeamMemberRow,
} from "@/lib/pdf/dd-tracking";

export const runtime = "nodejs";

// Canonical order of the 7 Phase 4 milestone dates. Drives both the
// query (these are the only items we pull) and the render order. Must
// stay in sync with the dateField items in src/db/checklist-template.ts.
const MILESTONE_NAMES: readonly string[] = [
  "LOI Signed Date",
  "PSA Effective Date",
  "Receive 1st Draft Cost to Complete",
  "Finalize Cost to Complete / Final Purchase Price",
  "Investment Committee Approval",
  "Waive Feasibility",
  "Closing Date",
] as const;

const CONSULTANT_ROLE_LABEL: Record<string, string> = {
  landscape_architect: "Landscape Architect",
  civil_engineer: "Civil Engineer",
  soils_engineer: "Soils Engineer",
  cost_to_complete: "Cost to Complete Consultant",
  hoa: "HOA Consultant",
  dry_utility: "Dry Utility Consultant",
  phase_1_environmental: "Phase I Environmental Consultant",
  land_use: "Land Use Consultant",
  biologist: "Biologist",
  architect: "Architect",
  psa_attorney: "PSA Attorney",
  title: "Title Consultant",
  escrow: "Escrow Consultant",
};

function formatLong(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Postgres `date` columns come back as either Date or "YYYY-MM-DD"
// strings depending on driver. Normalize before display.
function formatTrackedDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return formatShort(v);
  if (typeof v === "string") {
    const [y, m, d] = v.split("-").map((n) => Number(n));
    if (!y || !m || !d) return v;
    return formatShort(new Date(Date.UTC(y, m - 1, d)));
  }
  return null;
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

  // 1) Milestones. Pull the 7 Phase 4 checklist items by name and merge
  // with the canonical order so a missing row still renders as "not
  // scheduled".
  const milestoneRows = await db
    .select({
      name: checklistItems.name,
      trackedDate: checklistItems.trackedDate,
      completed: checklistItems.completed,
    })
    .from(checklistItems)
    .innerJoin(
      checklistCategories,
      eq(checklistCategories.id, checklistItems.categoryId),
    )
    .where(
      and(
        eq(checklistCategories.dealId, deal.id),
        eq(checklistCategories.phase, "phase_4"),
        inArray(checklistItems.name, [...MILESTONE_NAMES]),
      ),
    );

  const byName = new Map<string, { trackedDate: unknown; completed: boolean }>();
  for (const r of milestoneRows) {
    byName.set(r.name, { trackedDate: r.trackedDate, completed: r.completed });
  }
  const milestones: MilestoneRow[] = MILESTONE_NAMES.map((label) => {
    const r = byName.get(label);
    return {
      label,
      date: r ? formatTrackedDate(r.trackedDate) : null,
      completed: Boolean(r?.completed),
    };
  });

  // 2) Issues. Same shape as the old Issues Report.
  const issueRows = await db
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
    .where(and(eq(issues.dealId, deal.id), eq(issues.orgId, org.id)))
    .orderBy(issues.identifiedAt);

  const issuesForDoc: IssueRow[] = issueRows.map((r) => ({
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assignedName: r.assignedUserName || r.assignedUserEmail || null,
    identifiedDate: formatShort(r.identifiedAt),
  }));

  // 3) Deal team. Mirrors listDealTeam's join + resolution. Inline to
  // keep the route self-contained (no cross-imports of server actions).
  const teamRows = await db
    .select({
      team: dealTeamMembers.team,
      roleLabel: dealTeamMembers.roleLabel,
      sortOrder: dealTeamMembers.sortOrder,
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      freePhone: dealTeamMembers.phone,
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      userName: authUser.name,
      userEmail: authUser.email,
      userPhone: users.phone,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(and(eq(dealTeamMembers.dealId, deal.id), eq(dealTeamMembers.orgId, org.id)))
    .orderBy(dealTeamMembers.team, dealTeamMembers.sortOrder, dealTeamMembers.createdAt);

  const team: TeamMemberRow[] = teamRows.map((r) => {
    let name = "";
    let email: string | null = null;
    let phone: string | null = null;
    if (r.userId && (r.userName || r.userEmail)) {
      name = r.userName || r.userEmail || "";
      email = r.userEmail;
      phone = r.userPhone;
    } else if (r.contactId && (r.contactFirst || r.contactLast)) {
      name = `${r.contactFirst ?? ""} ${r.contactLast ?? ""}`.trim();
      email = r.contactEmail;
      phone = r.contactPhone;
    } else {
      name = r.freeName ?? "";
      email = r.freeEmail;
      phone = r.freePhone;
    }
    return {
      team: r.team,
      name,
      roleLabel: r.roleLabel,
      email,
      phone,
    };
  });

  // 4) Consultants. All roles, both sides. Order by role enum's natural
  // declaration order via the label map for predictability.
  const consultantRows = await db
    .select({
      role: consultants.role,
      side: consultants.side,
      firmName: consultants.firmName,
      contactName: consultants.contactName,
      contactEmail: consultants.contactEmail,
      contactPhone: consultants.contactPhone,
    })
    .from(consultants)
    .where(and(eq(consultants.dealId, deal.id), eq(consultants.orgId, org.id)))
    .orderBy(consultants.role, consultants.side, consultants.firmName);

  const consultantsForDoc: ConsultantRow[] = consultantRows.map((c) => ({
    roleLabel: CONSULTANT_ROLE_LABEL[c.role] ?? c.role,
    side: c.side,
    firmName: c.firmName,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
  }));

  const buffer = await renderToBuffer(
    DdTrackingDoc({
      dealName: deal.name,
      dateLabel: formatLong(new Date()),
      milestones,
      issues: issuesForDoc,
      team,
      consultants: consultantsForDoc,
    }),
  );

  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName
    ? `${safeName} - Due Diligence Tracking.pdf`
    : "Due Diligence Tracking.pdf";

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(buffer as unknown as BodyInit, { status: 200, headers });
}
