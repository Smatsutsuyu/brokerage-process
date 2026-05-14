"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { type EmailTemplate } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

import { getLeadsOnDeal } from "../actions";
import { BlastModal } from "./blast-modal";
import type { LeadOption } from "./lead-picker";

type Tier = "green" | "yellow" | "red" | "not_selected";

type BuyerBlastButtonProps = {
  dealId: string;
  // Visible button label on the checklist row.
  label: string;
  // Title shown in modal header (Step 1 prefixes "Send", Step 2 uses
  // verbatim).
  modalTitle: string;
  // Tooltip on the trigger.
  title?: string;
  template: EmailTemplate;
  defaultTiers: Tier[];
  // Optional checklist item to pull attachments from. When the row's
  // own files/links are the source, pass the row's own item.id; when
  // attachments live on a different row (like OM blast pulling from
  // Phase 1 Offering Memorandum), pass that other id.
  attachmentSourceItemId?: string | null;
  // Filter out builders who already submitted an offer. Used by the
  // "Follow up Missing Offers" send.
  excludeOfferReceived?: boolean;
  compact?: boolean;
};

// Reusable trigger for any tier-filtered "send to buyers" action on a
// Phase 2 checklist row. Lazy-loads the lead-options list on first
// open, then opens the configurable BlastModal with the template +
// tier defaults + attachment source the caller provided. OmBlastButton
// is a thin sibling that adds the "attachment source connector"
// affordance for the cross-row OM file relationship.
export function BuyerBlastButton({
  dealId,
  label,
  modalTitle,
  title,
  template,
  defaultTiers,
  attachmentSourceItemId,
  excludeOfferReceived,
  compact = true,
}: BuyerBlastButtonProps) {
  const [open, setOpen] = useState(false);
  const [leadOptions, setLeadOptions] = useState<LeadOption[] | null>(null);
  const [, startLoad] = useTransition();

  useEffect(() => {
    if (!open || leadOptions !== null) return;
    startLoad(async () => {
      try {
        const opts = await getLeadsOnDeal({ dealId });
        setLeadOptions(opts);
      } catch (err) {
        console.error("[buyer-blast] lead options load failed", err);
        setLeadOptions([]);
      }
    });
  }, [open, leadOptions, dealId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title ?? label}
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50",
        )}
      >
        <Mail className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {label}
      </button>

      {leadOptions !== null && (
        <BlastModal
          open={open}
          onOpenChange={setOpen}
          dealId={dealId}
          leadOptions={leadOptions}
          template={template}
          title={modalTitle}
          defaultTiers={defaultTiers}
          attachmentSourceItemId={attachmentSourceItemId}
          excludeOfferReceived={excludeOfferReceived}
        />
      )}
    </>
  );
}
