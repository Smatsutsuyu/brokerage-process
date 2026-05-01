import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, issues, users } from "@/db/schema";
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

  const orgUsers = org
    ? await db
        .select({
          id: users.id,
          name: authUser.name,
          email: authUser.email,
        })
        .from(users)
        .innerJoin(authUser, eq(authUser.id, users.authUserId))
        .where(eq(users.orgId, org.id))
        .orderBy(asc(authUser.name))
    : [];

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

  const userOptions: UserOption[] = orgUsers.map((u) => ({
    id: u.id,
    name: u.name || u.email,
  }));

  return <IssuesList dealId={dealId} items={items} users={userOptions} />;
}
