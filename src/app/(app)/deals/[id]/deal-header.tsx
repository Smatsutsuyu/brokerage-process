import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { DealMenu } from "./deal-menu";
import type { EditingDeal } from "../deal-modal";

type DealHeaderProps = {
  name: string;
  subtitle: string;
  statusLabel: string;
  priority: "low" | "medium" | "high";
  progressPct: number;
  deal: EditingDeal;
};

export function DealHeader({ name, subtitle, statusLabel, priority, progressPct, deal }: DealHeaderProps) {
  return (
    <header className="mb-5">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-[26px] leading-tight font-bold text-gray-900">{name}</h1>
        {priority === "high" && (
          <span className="text-brand-accent flex items-center gap-1 text-sm font-semibold">
            <Star className="h-4 w-4 fill-current" />
            High Priority
          </span>
        )}
        <Badge variant="secondary" className="ml-1">
          {statusLabel}
        </Badge>
        <div className="ml-auto">
          <DealMenu deal={deal} />
        </div>
      </div>
      <p className="text-[13px] text-gray-400">{subtitle}</p>

      <div className="mt-5 flex items-center gap-4 rounded-xl bg-white px-6 py-4 shadow-sm">
        <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Overall Progress
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="min-w-[40px] text-right text-sm font-bold tabular-nums text-gray-900">
          {progressPct}%
        </div>
      </div>
    </header>
  );
}
