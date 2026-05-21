"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";

import { SendMarketingReportModal } from "./send-marketing-report-modal";

type SendMarketingReportButtonProps = {
  dealId: string;
  // Match the compact pill style other Phase 2 checklist-row send
  // affordances use (OmBlastButton, ShareDdMaterialRowActions, etc.).
  compact?: boolean;
};

// Phase 2 "Send Marketing Report" row button. Opens a two-step modal:
// preview the freshly-generated PDF, then compose the email.
export function SendMarketingReportButton({
  dealId,
  compact = true,
}: SendMarketingReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Preview the Marketing Report PDF and email it to the Owner Team"
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50",
        )}
      >
        <Mail className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        Send Marketing Report
      </button>

      <SendMarketingReportModal
        open={open}
        onOpenChange={setOpen}
        dealId={dealId}
      />
    </>
  );
}
