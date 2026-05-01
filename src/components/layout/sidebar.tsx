import Link from "next/link";
import { Users } from "lucide-react";

import { db } from "@/db";
import { deals, checklistItems, checklistCategories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { LandAdvisorsLogo } from "@/components/brand/logo";
import { NewDealButton } from "@/components/layout/new-deal-button";
import { SidebarNavLink } from "@/components/layout/sidebar-nav-link";
import { UserLink } from "@/components/layout/user-link";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { cn } from "@/lib/utils";

type SidebarProps = {
  activeDealId?: string;
};

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

// Inferred phase chip styling — matches the phase-section header colors
// in the checklist view so the visual link is consistent.
const PHASE_CHIP: Record<Phase | "complete", { label: string; cls: string }> = {
  phase_1: { label: "Phase 1", cls: "bg-blue-100 text-blue-800" },
  phase_2: { label: "Phase 2", cls: "bg-emerald-100 text-emerald-800" },
  phase_3: { label: "Phase 3", cls: "bg-purple-100 text-purple-800" },
  phase_4: { label: "Phase 4", cls: "bg-orange-100 text-orange-800" },
  complete: { label: "Complete", cls: "bg-green-600 text-white" },
};

export async function Sidebar({ activeDealId }: SidebarProps) {
  const [org, me] = await Promise.all([getCurrentOrg(), getCurrentUser()]);

  // Per-deal aggregates: total/done plus per-phase incomplete counts so we
  // can derive the "current phase" (lowest phase with any unchecked item).
  const dealRows = org
    ? await db
        .select({
          id: deals.id,
          name: deals.name,
          city: deals.city,
          state: deals.state,
          priority: deals.priority,
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
        .where(eq(deals.orgId, org.id))
        .groupBy(deals.id)
        .orderBy(deals.name)
    : [];

  function inferPhase(d: (typeof dealRows)[number]): Phase | "complete" {
    if (Number(d.phase1Remaining) > 0) return "phase_1";
    if (Number(d.phase2Remaining) > 0) return "phase_2";
    if (Number(d.phase3Remaining) > 0) return "phase_3";
    if (Number(d.phase4Remaining) > 0) return "phase_4";
    return "complete";
  }

  return (
    <aside className="flex h-full min-h-0 w-[260px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
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
            const phaseChip = total > 0 ? PHASE_CHIP[inferPhase(deal)] : null;
            return (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className={cn(
                  "mb-1 block rounded-lg border border-transparent px-3.5 py-3 transition-colors",
                  isActive ? "border-brand-blue bg-blue-50" : "hover:bg-gray-100",
                )}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                  {deal.priority === "high" && (
                    <span className="text-brand-accent text-xs">★</span>
                  )}
                  <span className="truncate">{deal.name}</span>
                  {phaseChip && (
                    <span
                      className={cn(
                        "ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase",
                        phaseChip.cls,
                      )}
                    >
                      {phaseChip.label}
                    </span>
                  )}
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

      {me?.role === "owner" && (
        <div className="border-t border-gray-200 p-2">
          <div className="mb-1 px-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
            Admin
          </div>
          <SidebarNavLink href="/admin/members" icon={<Users className="h-3.5 w-3.5" />}>
            Members
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
