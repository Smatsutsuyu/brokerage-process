import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, dealTeamMembers, issues, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import { IssuesList, type IssueRow, type UserOption } from "./issues-list";

type IssuesViewProps = {
  dealId: string;
};

export async function IssuesView({ dealId }: IssuesViewProps) {
  const org = await getCurrentOrg();

  // Issue → users (assignee) → auth_user (display name + email).
  // Both joins are LEFT so unassigned issues still come back.
  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      assignedUserId: issues.assignedUserId,
      assigneeName: authUser.name,
      identifiedAt: issues.identifiedAt,
    })
    .from(issues)
    .leftJoin(users, eq(users.id, issues.assignedUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(issues.dealId, dealId))
    .orderBy(asc(issues.identifiedAt));

  // Scope the assignee picker to Deal Team members with a linked user
  // (contact-only or free-text team rows can't be assigned since
  // issues.assignedUserId FKs to users). A person on multiple sub-teams
  // shows once thanks to the Map dedupe below.
  const teamRows = org
    ? await db
        .select({
          id: users.id,
          name: authUser.name,
          email: authUser.email,
        })
        .from(dealTeamMembers)
        .innerJoin(users, eq(users.id, dealTeamMembers.userId))
        .innerJoin(authUser, eq(authUser.id, users.authUserId))
        .where(
          and(
            eq(dealTeamMembers.dealId, dealId),
            eq(dealTeamMembers.orgId, org.id),
          ),
        )
        .orderBy(asc(authUser.name))
    : [];

  const optionsById = new Map<string, UserOption>();
  for (const u of teamRows) {
    if (!optionsById.has(u.id)) {
      optionsById.set(u.id, { id: u.id, name: u.name || u.email });
    }
  }
  // Backward compat: keep any currently-assigned user in the picker even
  // if they've since been removed from the Deal Team, so editing an
  // existing issue doesn't silently drop the assignee.
  for (const r of rows) {
    if (r.assignedUserId && !optionsById.has(r.assignedUserId)) {
      optionsById.set(r.assignedUserId, {
        id: r.assignedUserId,
        name: r.assigneeName ?? "(unknown user)",
      });
    }
  }

  const items: IssueRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assignedUserId: r.assignedUserId,
    assigneeName: r.assigneeName,
    identifiedAt: r.identifiedAt.toISOString(),
  }));

  const userOptions: UserOption[] = [...optionsById.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return <IssuesList dealId={dealId} items={items} users={userOptions} />;
}
