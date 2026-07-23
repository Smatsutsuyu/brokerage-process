"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";

import { SendDealStatusModal } from "./send-deal-status-modal";

type SendDealStatusButtonProps = {
  dealId: string;
  // Compact (in-place row) vs default (header/toolbar). Default is the
  // header-mounted style since the primary consumer is the deal-header
  // action row — the Marketing Report button defaults to compact for
  // its Phase 2 row usage.
  compact?: boolean;
};

// "Email Status" button. Opens a two-step modal: preview the freshly-
// generated Status Report PDF, then compose the email to the Owner Team.
// Sibling of SendMarketingReportButton — same UX, different generator.
export function SendDealStatusButton({
  dealId,
  compact = false,
}: SendDealStatusButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Preview the deal Status Report PDF and email it to the Owner Team"
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
        )}
      >
        <Mail className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        Email Status
      </button>

      <SendDealStatusModal open={open} onOpenChange={setOpen} dealId={dealId} />
    </>
  );
}
