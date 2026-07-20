import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  contacts,
  dealTeamMembers,
  issues,
  users,
} from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { resolveDealTeamMemberName } from "@/lib/deal-team-name";

import { IssuesList, type AssigneeOption, type IssueRow } from "./issues-list";

type IssuesViewProps = {
  dealId: string;
};

export async function IssuesView({ dealId }: IssuesViewProps) {
  const org = await getCurrentOrg();

  // Issue → deal_team_members (assignee) → polymorphic identity chain to
  // resolve a display name. All joins are LEFT so unassigned issues (and
  // team members with any identity source) still come back.
  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      assigneeTeamMemberId: issues.assigneeTeamMemberId,
      // Identity resolution columns (all nullable — polymorphic).
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
    // dtm join scoped to this deal + org so a forged/stale
    // assigneeTeamMemberId pointing at a foreign row resolves to null
    // instead of leaking a foreign display name into the picker/UI.
    // Server actions already validate on write; this is defense-in-depth.
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
    .where(eq(issues.dealId, dealId))
    .orderBy(asc(issues.identifiedAt));

  // Every Deal Team member on this deal is a candidate assignee — user,
  // contact, or free-text identity source, any sub-team (Owner / Broker /
  // Buyer). One query pulls the roster with all fields needed to resolve
  // display names; the same helper as above collapses the polymorphic
  // shape into a single name string.
  const teamRows = org
    ? await db
        .select({
          id: dealTeamMembers.id,
          userId: dealTeamMembers.userId,
          contactId: dealTeamMembers.contactId,
          freeName: dealTeamMembers.name,
          userName: authUser.name,
          userEmail: authUser.email,
          contactFirst: contacts.firstName,
          contactLast: contacts.lastName,
          team: dealTeamMembers.team,
          sortOrder: dealTeamMembers.sortOrder,
        })
        .from(dealTeamMembers)
        .leftJoin(users, eq(users.id, dealTeamMembers.userId))
        .leftJoin(authUser, eq(authUser.id, users.authUserId))
        .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
        .leftJoin(builders, eq(builders.id, contacts.builderId))
        .where(
          and(
            eq(dealTeamMembers.dealId, dealId),
            eq(dealTeamMembers.orgId, org.id),
          ),
        )
        .orderBy(
          dealTeamMembers.team,
          dealTeamMembers.sortOrder,
          dealTeamMembers.createdAt,
        )
    : [];

  const optionsById = new Map<string, AssigneeOption>();
  for (const t of teamRows) {
    if (!optionsById.has(t.id)) {
      optionsById.set(t.id, { id: t.id, name: resolveDealTeamMemberName(t) });
    }
  }

  // Backward-compat: any issue currently assigned to a team member row
  // that's since been removed from the roster stays in the picker so
  // editing the issue doesn't silently drop the assignee.
  for (const r of rows) {
    if (r.assigneeTeamMemberId && !optionsById.has(r.assigneeTeamMemberId)) {
      // Resolve name from the joined columns on the issue row itself; if
      // the team_member row is gone entirely (FK set null already fired)
      // this whole branch won't hit — the assigneeTeamMemberId will be
      // null. If the FK still resolves but display columns are all null
      // (deleted contact / auth user), the resolver returns "(unknown)".
      const name = resolveDealTeamMemberName({
        userId: r.dtmUserId,
        contactId: r.dtmContactId,
        freeName: r.dtmFreeName,
        userName: r.dtmUserName,
        userEmail: r.dtmUserEmail,
        contactFirst: r.dtmContactFirst,
        contactLast: r.dtmContactLast,
      });
      optionsById.set(r.assigneeTeamMemberId, { id: r.assigneeTeamMemberId, name });
    }
  }

  const items: IssueRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assigneeTeamMemberId: r.assigneeTeamMemberId,
    assigneeName: r.assigneeTeamMemberId
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
    identifiedAt: r.identifiedAt.toISOString(),
  }));

  const assigneeOptions: AssigneeOption[] = [...optionsById.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return <IssuesList dealId={dealId} items={items} assignees={assigneeOptions} />;
}
