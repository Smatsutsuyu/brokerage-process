import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { MembersList, type MemberRow } from "./members-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Members — Lakebridge Capital",
};

export default async function MembersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  if (me.role !== "owner") redirect("/");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.orgId, org.id))
    .orderBy(asc(users.lastName), asc(users.firstName));

  const members: MemberRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    role: r.role,
    disabled: r.disabledAt !== null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-10 py-8">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">Members</h1>
          <p className="text-[13px] text-gray-400">
            Add team members, change roles, and disable access. Owner-only.
          </p>
        </header>
        <MembersList currentUserId={me.id} members={members} />
      </main>
    </>
  );
}
