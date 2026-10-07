"use client";

import { QA_FILE_TEMPLATE } from "@/lib/email-templates";

import { BuyerBlastButton } from "./buyer-blast-button";

// "Send Q&A": the tier-filtered Q&A File blast. One component for both
// entry points, the Phase 2 Q&A File checklist row (compact) and the Q&A
// tab toolbar, so the two can never drift apart.
//
// `qaFileItemId` is the Q&A File checklist row; files uploaded there are
// offered as attachments. Null when the deal has no such row, in which
// case the composer still opens, just with nothing pre-attached.
export function SendQaFileButton({
  dealId,
  qaFileItemId,
  compact = true,
}: {
  dealId: string;
  qaFileItemId: string | null;
  compact?: boolean;
}) {
  return (
    <BuyerBlastButton
      dealId={dealId}
      label="Send Q&A"
      modalTitle="Q&A File distribution"
      title="Filter buyers and send the Q&A file (attached from the Q&A File checklist row)."
      template={QA_FILE_TEMPLATE}
      defaultTiers={["green", "yellow"]}
      attachmentSourceItemId={qaFileItemId}
      compact={compact}
    />
  );
}
