import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  checklistCategories,
  checklistItems,
  contacts,
  dealTeamMembers,
  deals,
  issues,
  users,
} from "@/db/schema";
import { resolveDealTeamMemberName } from "@/lib/deal-team-name";

import {
  DealStatusDoc,
  type PhaseProgressRow,
  type RecentlyCompletedRow,
  type StatusIssueRow,
  type StatusTeamMemberRow,
  type UpcomingMilestoneRow,
} from "./deal-status";

// Single source of truth for rendering the per-deal Status Report PDF
// to bytes. Called from two places:
//   1. /api/deals/[id]/status.pdf — streams inline for browser preview.
//   2. src/lib/email/generators.ts — used when the Status Report is
//      attached to a blast via kind: "generated" (Email Status flow).
//
// Org-scoped lookup so a forged dealId from a sibling org returns null.

export type DealStatusPdf = {
  filename: string;
  content: Buffer;
};

const PHASE_LABEL: Record<
  "phase_1" | "phase_2" | "phase_3" | "phase_4",
  string
> = {
  phase_1: "Phase 1 - Going to Market",
  phase_2: "Phase 2 - Marketing Process",
  phase_3: "Phase 3 - Summary of Offers",
  phase_4: "Phase 4 - Due Diligence",
};

// Match the DD Tracking PDF's milestone set + ordering.
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
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Postgres `date` columns come back as either Date or "YYYY-MM-DD" strings
// depending on the driver. Normalize.
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

// Local-YYYY-MM-DD compare so date-only Postgres columns don't suffer
// timezone drift when checking "has this happened?" against today. Same
// pattern used in the DD Tracking route.
function trackedDateIso(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return null;
}

export async function generateDealStatusPdf(input: {
  dealId: string;
  orgId: string;
}): Promise<DealStatusPdf | null> {
  const [deal] = await db
    .select({ id: deals.id, name: deals.name, purchasePrice: deals.purchasePrice })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, input.orgId)))
    .limit(1);
  if (!deal) return null;

  const purchasePrice =
    deal.purchasePrice != null ? Number(deal.purchasePrice) : null;

  // 1) Checklist rollups + recently-completed. Single query, then two
  // client-side rollups since the row count is tiny (max ~50 per deal).
  const itemRows = await db
    .select({
      id: checklistItems.id,
      name: checklistItems.name,
      completed: checklistItems.completed,
      optional: checklistItems.optional,
      completedAt: checklistItems.completedAt,
      completedByName: authUser.name,
      phase: checklistCategories.phase,
      categoryName: checklistCategories.name,
    })
    .from(checklistItems)
    .innerJoin(
      checklistCategories,
      eq(checklistItems.categoryId, checklistCategories.id),
    )
    .leftJoin(users, eq(users.id, checklistItems.completedBy))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(checklistCategories.dealId, deal.id));

  const perPhase = new Map<
    "phase_1" | "phase_2" | "phase_3" | "phase_4",
    { done: number; total: number }
  >();
  for (const p of ["phase_1", "phase_2", "phase_3", "phase_4"] as const) {
    perPhase.set(p, { done: 0, total: 0 });
  }
  let overallDone = 0;
  let overallTotal = 0;
  for (const r of itemRows) {
    const bucket = perPhase.get(r.phase);
    if (bucket) {
      bucket.total++;
      overallTotal++;
      if (r.completed) {
        bucket.done++;
        overallDone++;
      }
    }
  }
  const phaseProgress: PhaseProgressRow[] = (
    ["phase_1", "phase_2", "phase_3", "phase_4"] as const
  ).map((p) => ({
    phase: p,
    label: PHASE_LABEL[p],
    done: perPhase.get(p)!.done,
    total: perPhase.get(p)!.total,
  }));
  const overallPct =
    overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  // "Currently:" = lowest phase (Phase 1 -> 4) that still has any
  // required (non-optional) incomplete item. If everything is done,
  // report "Complete."
  let currentPhaseLabel = "Complete";
  for (const p of ["phase_1", "phase_2", "phase_3", "phase_4"] as const) {
    const incompleteRequired = itemRows.some(
      (r) => r.phase === p && !r.completed && !r.optional,
    );
    if (incompleteRequired) {
      currentPhaseLabel = PHASE_LABEL[p];
      break;
    }
  }

  // Recently-completed: last 10 completed items by completedAt desc.
  // Tie-break by item id so the top-10 slice is deterministic across
  // renders when two items land on the same timestamp.
  const recentlyCompleted: RecentlyCompletedRow[] = itemRows
    .filter((r) => r.completed && r.completedAt)
    .sort((a, b) => {
      const at = a.completedAt ? a.completedAt.getTime() : 0;
      const bt = b.completedAt ? b.completedAt.getTime() : 0;
      if (bt !== at) return bt - at;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, 10)
    .map((r) => ({
      itemName: r.name,
      categoryName: r.categoryName,
      phaseLabel: PHASE_LABEL[r.phase].split(" - ")[0],
      completedAt: formatShort(r.completedAt),
      completedByName: r.completedByName,
    }));

  // 2) Upcoming milestones: same set as the DD Tracking PDF, filtered to
  // items that haven't happened (no tracked date OR date is in the future
  // AND not marked complete). Preserves the canonical order.
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
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const byMilestoneName = new Map<
    string,
    { trackedDate: unknown; completed: boolean }
  >();
  for (const r of milestoneRows) {
    byMilestoneName.set(r.name, { trackedDate: r.trackedDate, completed: r.completed });
  }
  // Keep every non-completed milestone: no date (unscheduled), future date
  // (upcoming), OR past date with no completion check (overdue — flagged
  // so the report exposes slipping milestones rather than dropping them).
  // Only complete-and-past items are hidden. Matches the "hasHappened"
  // semantic in the DD Tracking PDF, inverted.
  const upcomingMilestones: UpcomingMilestoneRow[] = MILESTONE_NAMES.filter(
    (label) => {
      const row = byMilestoneName.get(label);
      if (!row) return true;
      return !row.completed;
    },
  ).map((label) => {
    const row = byMilestoneName.get(label);
    const iso = row ? trackedDateIso(row.trackedDate) : null;
    const overdue = iso != null && iso <= todayIso;
    return {
      label,
      date: row ? formatTrackedDate(row.trackedDate) : null,
      overdue,
    };
  });

  // 3) Open issues (open + in_progress).
  const issueRows = await db
    .select({
      title: issues.title,
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
    })
    .from(issues)
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
    .where(
      and(
        eq(issues.dealId, deal.id),
        eq(issues.orgId, input.orgId),
        inArray(issues.status, ["open", "in_progress"]),
      ),
    )
    .orderBy(
      // Priority rank ascending: urgent (0) first, low (3) last. Ties
      // broken by identifiedAt so the ordering is stable across renders.
      asc(
        sql`case ${issues.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 end`,
      ),
      asc(issues.identifiedAt),
    );

  const openIssues: StatusIssueRow[] = issueRows.map((r) => ({
    title: r.title,
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
  }));

  // 4) Owner Team roster with resolved names + emails.
  const teamRows = await db
    .select({
      roleLabel: dealTeamMembers.roleLabel,
      sortOrder: dealTeamMembers.sortOrder,
      freeName: dealTeamMembers.name,
      freeEmail: dealTeamMembers.email,
      userId: dealTeamMembers.userId,
      contactId: dealTeamMembers.contactId,
      userName: authUser.name,
      userEmail: authUser.email,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(users.id, dealTeamMembers.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
    .where(
      and(
        eq(dealTeamMembers.dealId, deal.id),
        eq(dealTeamMembers.orgId, input.orgId),
        eq(dealTeamMembers.team, "owner"),
      ),
    )
    .orderBy(asc(dealTeamMembers.sortOrder), asc(dealTeamMembers.createdAt));

  const ownerTeam: StatusTeamMemberRow[] = teamRows.map((r) => ({
    name: resolveDealTeamMemberName({
      userId: r.userId,
      contactId: r.contactId,
      freeName: r.freeName,
      userName: r.userName,
      userEmail: r.userEmail,
      contactFirst: r.contactFirst,
      contactLast: r.contactLast,
    }),
    roleLabel: r.roleLabel,
    email:
      (r.userId && r.userEmail) ||
      (r.contactId && r.contactEmail) ||
      r.freeEmail ||
      null,
  }));

  const content = await renderToBuffer(
    DealStatusDoc({
      dealName: deal.name,
      dateLabel: formatLong(new Date()),
      purchasePrice,
      currentPhaseLabel,
      overall: { done: overallDone, total: overallTotal, pct: overallPct },
      phaseProgress,
      recentlyCompleted,
      upcomingMilestones,
      openIssues,
      ownerTeam,
    }),
  );

  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName ? `${safeName} - Status Report.pdf` : "Status Report.pdf";

  return { filename, content };
}
