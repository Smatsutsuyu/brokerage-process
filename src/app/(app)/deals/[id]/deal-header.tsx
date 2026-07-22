"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";

import { formatCurrency } from "@/lib/currency";

import { DealMenu } from "./deal-menu";
import { DealModal, type EditingDeal } from "../deal-modal";

type DealHeaderProps = {
  name: string;
  subtitle: string;
  priority: "normal" | "high";
  progressPct: number;
  deal: EditingDeal;
  hasBanner: boolean;
};

export function DealHeader({
  name,
  subtitle,
  priority,
  progressPct,
  deal,
  hasBanner,
}: DealHeaderProps) {
  // Edit-deal modal state lives here (not inside DealMenu) so both the
  // menu's Edit-deal item AND the "+ Add purchase price" CTA below can
  // open the same modal.
  const [editOpen, setEditOpen] = useState(false);

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
        {deal.purchasePrice != null ? (
          <span
            className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200/60 ring-inset tabular-nums"
            title="Final purchase price"
          >
            {formatCurrency(deal.purchasePrice)}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 bg-transparent px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            title="Set the final purchase price"
          >
            <Plus className="h-3 w-3" />
            Add purchase price
          </button>
        )}
        <div className="ml-auto">
          <DealMenu deal={deal} hasBanner={hasBanner} onEditClick={() => setEditOpen(true)} />
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

      <DealModal open={editOpen} onOpenChange={setEditOpen} editing={deal} />
    </header>
  );
}
