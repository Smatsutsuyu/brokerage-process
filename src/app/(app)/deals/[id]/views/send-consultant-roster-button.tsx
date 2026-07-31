"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";

import { SendConsultantRosterModal } from "./send-consultant-roster-modal";

type SendConsultantRosterButtonProps = {
  dealId: string;
  // Compact (inline on the Phase 4 checklist row) vs default (Consultants
  // tab toolbar). Defaults to compact since the checklist row was the
  // first consumer.
  compact?: boolean;
};

// "Send to Deal Team" for the consultant roster. Opens the two-step
// modal: preview the freshly-generated roster PDF, then compose the
// email with that PDF attached.
export function SendConsultantRosterButton({
  dealId,
  compact = true,
}: SendConsultantRosterButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Preview the Consultant Roster PDF and email it to the Deal Team"
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
        )}
      >
        <Send className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        {compact ? "Send to Deal Team" : "Email roster"}
      </button>

      <SendConsultantRosterModal
        open={open}
        onOpenChange={setOpen}
        dealId={dealId}
      />
    </>
  );
}
