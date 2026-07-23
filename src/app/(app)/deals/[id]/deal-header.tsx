"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, Star } from "lucide-react";

import { formatCurrency } from "@/lib/currency";

import { DealActionsMenu } from "./deal-actions-menu";
import { SendDealStatusButton } from "./views/send-deal-status-button";
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
  // Edit-deal modal state lives here (not inside DealActionsMenu) so the
  // header's direct-click "Edit" button opens the same modal instance
  // that the price CTA opens.
  const [editOpen, setEditOpen] = useState(false);

  const isArchived = deal.archivedAt !== null;

  return (
    <header className="mb-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] leading-tight font-bold text-gray-900">{name}</h1>
        {isArchived && (
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200/60 ring-inset">
            <Archive className="h-3 w-3" />
            Archived
          </span>
        )}
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
        <div className="ml-auto flex items-center gap-2">
          <SendDealStatusButton dealId={deal.dealId} />
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
            title="Edit deal details"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <DealActionsMenu deal={deal} hasBanner={hasBanner} />
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
