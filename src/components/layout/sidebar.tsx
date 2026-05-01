import Link from "next/link";

import { db } from "@/db";
import { deals, checklistItems, checklistCategories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { LandAdvisorsLogo } from "@/components/brand/logo";
import { NewDealButton } from "@/components/layout/new-deal-button";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { cn } from "@/lib/utils";

type SidebarProps = {
  activeDealId?: string;
};

export async function Sidebar({ activeDealId }: SidebarProps) {
  const org = await getCurrentOrg();

  const dealRows = org
    ? await db
        .select({
          id: deals.id,
          name: deals.name,
          city: deals.city,
          state: deals.state,
          status: deals.status,
          priority: deals.priority,
          totalItems: sql<number>`count(${checklistItems.id})::int`,
          doneItems: sql<number>`count(${checklistItems.id}) filter (where ${checklistItems.completed} = true)::int`,
        })
        .from(deals)
        .leftJoin(checklistCategories, eq(checklistCategories.dealId, deals.id))
        .leftJoin(checklistItems, eq(checklistItems.categoryId, checklistCategories.id))
        .where(eq(deals.orgId, org.id))
        .groupBy(deals.id)
        .orderBy(deals.name)
    : [];

  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-5">
        <LandAdvisorsLogo />
      </div>

      <div className="border-b border-gray-200 p-5">
        <div className="mb-3 text-xs font-bold tracking-wider text-gray-700 uppercase">Deals</div>
        <NewDealButton />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {dealRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400 italic">
            No deals yet. Run <code>npm run db:seed</code> to add sample data.
          </div>
        ) : (
          dealRows.map((deal) => {
            const isActive = deal.id === activeDealId;
            const total = Number(deal.totalItems ?? 0);
            const done = Number(deal.doneItems ?? 0);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className={cn(
                  "mb-1 block rounded-lg border border-transparent px-3.5 py-3 transition-colors",
                  isActive
                    ? "border-brand-blue bg-blue-50"
                    : "hover:bg-gray-100",
                )}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                  {deal.priority === "high" && (
                    <span className="text-brand-accent text-xs">★</span>
                  )}
                  <span className="truncate">{deal.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="truncate">
                    {[deal.city, deal.state].filter(Boolean).join(", ") || "—"}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="h-1 w-12 overflow-hidden rounded-full bg-gray-200">
                      <span
                        className="bg-brand-blue block h-full"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="font-medium tabular-nums">
                      {done}/{total}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
