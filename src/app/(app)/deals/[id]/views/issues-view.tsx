import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { issues, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import { IssuesList, type IssueRow, type UserOption } from "./issues-list";

type IssuesViewProps = {
  dealId: string;
};

export async function IssuesView({ dealId }: IssuesViewProps) {
  const org = await getCurrentOrg();

  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      assignedUserId: issues.assignedUserId,
      assigneeFirstName: users.firstName,
      assigneeLastName: users.lastName,
      identifiedAt: issues.identifiedAt,
    })
    .from(issues)
    .leftJoin(users, eq(users.id, issues.assignedUserId))
    .where(eq(issues.dealId, dealId))
    .orderBy(asc(issues.identifiedAt));

  const orgUsers = org
    ? await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(users)
        .where(eq(users.orgId, org.id))
        .orderBy(asc(users.lastName))
    : [];

  const items: IssueRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assignedUserId: r.assignedUserId,
    assigneeName:
      r.assigneeFirstName || r.assigneeLastName
        ? `${r.assigneeFirstName ?? ""} ${r.assigneeLastName ?? ""}`.trim()
        : null,
    identifiedAt: r.identifiedAt.toISOString(),
  }));

  const userOptions: UserOption[] = orgUsers.map((u) => ({
    id: u.id,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
  }));

  return <IssuesList dealId={dealId} items={items} users={userOptions} />;
}
