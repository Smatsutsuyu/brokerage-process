import Link from "next/link";
import { Star } from "lucide-react";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

export async function PriorityRibbon() {
  const org = await getCurrentOrg();
  const highPriority = org
    ? await db
        .select({ id: deals.id, name: deals.name })
        .from(deals)
        .where(and(eq(deals.orgId, org.id), eq(deals.priority, "high")))
        .limit(20)
    : [];

  return (
    <div className="from-brand-navy to-brand-navy-deep border-brand-accent flex items-center gap-3 overflow-x-auto border-b-2 bg-gradient-to-br px-5 py-2.5 whitespace-nowrap">
      <div className="text-brand-accent flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase">
        <Star className="h-3.5 w-3.5 fill-current" />
        High Priority
      </div>
      {highPriority.length === 0 ? (
        <span className="text-xs text-white/40 italic">Star a deal to pin it here</span>
      ) : (
        highPriority.map((deal) => (
          <Link
            key={deal.id}
            href={`/deals/${deal.id}`}
            className="border-brand-accent/30 bg-brand-accent/10 hover:bg-brand-accent/20 flex-shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-semibold text-amber-400 transition-colors"
          >
            {deal.name}
          </Link>
        ))
      )}
    </div>
  );
}
