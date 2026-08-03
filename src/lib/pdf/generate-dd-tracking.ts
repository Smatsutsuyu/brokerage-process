import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  checklistCategories,
  checklistItems,
  consultants,
  contacts,
  dealTeamMembers,
  deals,
  issues,
  users,
} from "@/db/schema";
import { ROLE_LABEL as CONSULTANT_ROLE_LABEL } from "@/lib/consultant-roles";
import { resolveDealTeamMemberName } from "@/lib/deal-team-name";

import {
  DdTrackingDoc,
  type ConsultantRow,
  type IssueRow,
  type MilestoneRow,
  type TeamMemberRow,
} from "./dd-tracking";

// Single source of truth for rendering the Due Diligence Tracking PDF to
// bytes. Called from two places:
//   1. /api/deals/[id]/dd-tracking.pdf — streams inline for browser preview.
//   2. src/lib/email/generators.ts — attaches the report as real bytes
//      when the Phase 4 "Complete Due Diligence" row emails the Deal Team.
//
// Extracted from the route on 2026-08-03. Before that the email path
// attached the report as kind: "link" pointing at the route's relative,
// session-gated URL, which meant recipients received the literal string
// "/api/deals/<id>/dd-tracking.pdf" in the message body and never got the
// report at all. Mirrors generate-deal-status.ts / generate-marketing-report.ts.
//
// Org-scoped lookup so a forged dealId from a sibling org returns null.

export type DdTrackingPdf = {
  filename: string;
  content: Buffer;
};

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

// Local-YYYY-MM-DD so a date-only column doesn't suffer timezone drift
// when compared against today.
function trackedDateIso(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return null;
}

export async function generateDdTrackingPdf(input: {
  dealId: string;
  orgId: string;
}): Promise<DdTrackingPdf | null> {
  const [deal] = await db
    .select({
      id: deals.id,
      name: deals.name,
      purchasePrice: deals.purchasePrice,
    })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, input.orgId)))
    .limit(1);
  if (!deal) return null;

  // Drizzle returns numeric() as a string; PDF layer wants Number | null.
  const purchasePrice =
    deal.purchasePrice != null ? Number(deal.purchasePrice) : null;

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
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const milestones: MilestoneRow[] = MILESTONE_NAMES.map((label) => {
    const r = byName.get(label);
    const iso = r ? trackedDateIso(r.trackedDate) : null;
    // "Has happened" fires when the user explicitly checked the item
    // complete OR the tracked date is today-or-past. OR keeps auto-
    // detection working without forcing a manual check on every past
    // milestone.
    const hasHappened = Boolean(r?.completed) || (iso != null && iso <= todayIso);
    return {
      label,
      date: r ? formatTrackedDate(r.trackedDate) : null,
      completed: Boolean(r?.completed),
      hasHappened,
    };
  });

  // 2) Issues. Assignee resolved through the Deal Team polymorphic identity
  // chain (user > contact > free-text) so Owner/Buyer team members without
  // an org user account still render.
  const issueRows = await db
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
    })
    .from(issues)
    // Same defense-in-depth scoping as issues-view.tsx: a forged
    // assigneeTeamMemberId pointing at a foreign dtm resolves to null
    // rather than leaking that member's name into the PDF.
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
    .where(and(eq(issues.dealId, deal.id), eq(issues.orgId, input.orgId)))
    .orderBy(issues.identifiedAt);

  const issuesForDoc: IssueRow[] = issueRows.map((r) => ({
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assignedName: r.assigneeTeamMemberId
      ? resolveDealTeamMemberName({
          userId: r.dtmUserId,
          contactId: r.dtmContactId,
          freeName: r.dtmFreeName,
          userName: r.dtmUserName,
          userEmail: r.dtmUserEmail,
          contactFirst: r.dtmContactFirst,
          contactLast: r.dtmContactLast,
        })
      : null,
    identifiedDate: formatShort(r.identifiedAt),
  }));

  // 3) Deal team. Mirrors listDealTeam's join + resolution.
  //
  // NOTE: this resolver returns "" where resolveDealTeamMemberName would
  // return "(unknown)", so the same person can render differently in the
  // roster section and the issues section above. Pre-existing divergence,
  // left as-is here to keep this extraction a pure move; folding both
  // through the shared helper is its own backlog item.
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
    .where(
      and(eq(dealTeamMembers.dealId, deal.id), eq(dealTeamMembers.orgId, input.orgId)),
    )
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
    .where(and(eq(consultants.dealId, deal.id), eq(consultants.orgId, input.orgId)))
    .orderBy(consultants.role, consultants.side, consultants.firmName);

  const consultantsForDoc: ConsultantRow[] = consultantRows.map((c) => ({
    roleLabel: CONSULTANT_ROLE_LABEL[c.role] ?? c.role,
    side: c.side,
    firmName: c.firmName,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
  }));

  const content = await renderToBuffer(
    DdTrackingDoc({
      dealName: deal.name,
      dateLabel: formatLong(new Date()),
      purchasePrice,
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

  return { filename, content };
}
