import { Building2, Contact, MessageSquare, Users } from "lucide-react";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  deals,
  checklistItems,
  checklistCategories,
  userDealOrders,
} from "@/db/schema";
import { LandAdvisorsLogo } from "@/components/brand/logo";
import { NewDealButton } from "@/components/layout/new-deal-button";
import {
  SidebarDealsList,
  type SidebarDealItem,
} from "@/components/layout/sidebar-deals-list";
import { SidebarNavLink } from "@/components/layout/sidebar-nav-link";
import { UserLink } from "@/components/layout/user-link";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

type SidebarProps = {
  activeDealId?: string;
};

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

export async function Sidebar({ activeDealId }: SidebarProps) {
  const [org, me] = await Promise.all([getCurrentOrg(), getCurrentUser()]);

  // Per-deal aggregates: total/done plus per-phase incomplete counts so we
  // can derive the "current phase" (lowest phase with any unchecked item).
  // LEFT JOIN to user_deal_orders pulls each deal's user-specific sort
  // position; unordered deals fall to the bottom alphabetically via the
  // big-int fallback in COALESCE.
  const dealRows =
    org && me
      ? await db
          .select({
            id: deals.id,
            name: deals.name,
            city: deals.city,
            state: deals.state,
            priority: deals.priority,
            archivedAt: deals.archivedAt,
            sortOrder:
              sql<number>`coalesce(${userDealOrders.sortOrder}, 2147483647)`.as(
                "sort_order_effective",
              ),
            totalItems: sql<number>`count(${checklistItems.id})::int`,
            doneItems: sql<number>`count(${checklistItems.id}) filter (where ${checklistItems.completed} = true)::int`,
            phase1Remaining: sql<number>`count(${checklistItems.id}) filter (where ${checklistCategories.phase} = 'phase_1' and ${checklistItems.completed} = false and ${checklistItems.optional} = false)::int`,
            phase2Remaining: sql<number>`count(${checklistItems.id}) filter (where ${checklistCategories.phase} = 'phase_2' and ${checklistItems.completed} = false and ${checklistItems.optional} = false)::int`,
            phase3Remaining: sql<number>`count(${checklistItems.id}) filter (where ${checklistCategories.phase} = 'phase_3' and ${checklistItems.completed} = false and ${checklistItems.optional} = false)::int`,
            phase4Remaining: sql<number>`count(${checklistItems.id}) filter (where ${checklistCategories.phase} = 'phase_4' and ${checklistItems.completed} = false and ${checklistItems.optional} = false)::int`,
          })
          .from(deals)
          .leftJoin(checklistCategories, eq(checklistCategories.dealId, deals.id))
          .leftJoin(checklistItems, eq(checklistItems.categoryId, checklistCategories.id))
          .leftJoin(
            userDealOrders,
            and(
              eq(userDealOrders.dealId, deals.id),
              eq(userDealOrders.userId, me.id),
            ),
          )
          .where(eq(deals.orgId, org.id))
          .groupBy(deals.id, userDealOrders.sortOrder)
          .orderBy(sql`sort_order_effective`, deals.name)
      : [];

  function inferPhase(d: (typeof dealRows)[number]): Phase | "complete" {
    if (Number(d.phase1Remaining) > 0) return "phase_1";
    if (Number(d.phase2Remaining) > 0) return "phase_2";
    if (Number(d.phase3Remaining) > 0) return "phase_3";
    if (Number(d.phase4Remaining) > 0) return "phase_4";
    return "complete";
  }

  // Pre-shape rows into the client component's expected SidebarDealItem
  // shape (numbers coerced, phase derived). Keeps the client free of
  // Drizzle types + DB-typing concerns.
  const items: SidebarDealItem[] = dealRows.map((d) => {
    const total = Number(d.totalItems ?? 0);
    return {
      id: d.id,
      name: d.name,
      city: d.city,
      state: d.state,
      priority: (d.priority ?? "normal") as "normal" | "high",
      archived: d.archivedAt !== null,
      total,
      done: Number(d.doneItems ?? 0),
      phase: total > 0 ? inferPhase(d) : null,
    };
  });

  return (
    <aside className="flex h-full min-h-0 w-[260px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <LandAdvisorsLogo className="h-auto w-full" />
      </div>

      <div className="border-b border-gray-200 p-5">
        <div className="mb-3 text-xs font-bold tracking-wider text-gray-700 uppercase">Deals</div>
        <NewDealButton />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <SidebarDealsList deals={items} activeDealId={activeDealId} />
      </nav>

      {/* Org-wide directories — Contacts and Builders. Visible to everyone
          (any role can use them to populate deals). Sit above the Admin
          section so they read as primary features, not admin-only utilities. */}
      <div className="border-t border-gray-200 p-2">
        <SidebarNavLink href="/builders" icon={<Building2 className="h-3.5 w-3.5" />}>
          Builders
        </SidebarNavLink>
        <SidebarNavLink href="/contacts" icon={<Contact className="h-3.5 w-3.5" />}>
          Contacts
        </SidebarNavLink>
      </div>

      {me?.role === "owner" && (
        <div className="border-t border-gray-200 p-2">
          <div className="mb-1 px-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
            Admin
          </div>
          <SidebarNavLink href="/admin/members" icon={<Users className="h-3.5 w-3.5" />}>
            Members
          </SidebarNavLink>
          <SidebarNavLink
            href="/admin/feedback"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
          >
            Feedback
          </SidebarNavLink>
        </div>
      )}

      {me && (
        <div className="border-t border-gray-200 p-2">
          <UserLink name={me.name || me.email} email={me.email} role={me.role} />
        </div>
      )}
    </aside>
  );
}
