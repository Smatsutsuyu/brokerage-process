import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, authUser, users } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { AuditList, type AuditEntryRow } from "./audit-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit log — Land Advisors Portal",
};

// Unlike members and feedback, audit_log only grows — it is never triaged
// down. An unpaginated select is fine today (production holds a handful of
// rows) but would eventually ship tens of thousands of rows to the browser,
// so the default read is capped and the cap is stated in the UI rather than
// silently truncating. `?all=1` lifts it for the rare full export.
const DEFAULT_LIMIT = 500;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  if (me.role !== "owner") redirect("/");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  const { all } = await searchParams;
  const showAll = all === "1";

  // Two left joins to resolve the actor: audit_log.user_id → users →
  // auth_user. Both are LEFT because user_id is nullable (system entries)
  // and because the FK is `onDelete: set null` — a removed member leaves
  // their entries behind with no actor, which is intentional. Those render
  // as "Removed user".
  const baseQuery = db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorId: auditLog.userId,
      actorName: authUser.name,
      actorEmail: authUser.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(auditLog.orgId, org.id))
    .orderBy(desc(auditLog.createdAt));

  // Fetch one past the cap so we can tell "exactly 500 entries exist" from
  // "there are more than 500" without a second count query.
  const rows = showAll ? await baseQuery : await baseQuery.limit(DEFAULT_LIMIT + 1);
  const truncated = !showAll && rows.length > DEFAULT_LIMIT;
  const visibleRows = truncated ? rows.slice(0, DEFAULT_LIMIT) : rows;

  const entries: AuditEntryRow[] = visibleRows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    before: asRecord(r.before),
    after: asRecord(r.after),
    metadata: asRecord(r.metadata),
    createdAt: r.createdAt.toISOString(),
    actorId: r.actorId,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
  }));

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">Audit log</h1>
          <p className="text-[13px] text-gray-400">
            Who changed what, and when. Every entry records the person who made the change and
            the value before and after it. Owner-only.
          </p>
        </header>
        <AuditList entries={entries} truncated={truncated} limit={DEFAULT_LIMIT} />
      </main>
    </>
  );
}

// jsonb columns come back as `unknown`. Every writer stores a plain object,
// but the column accepts any JSON value, so narrow defensively rather than
// casting and letting a stray array or scalar crash the client renderer.
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
