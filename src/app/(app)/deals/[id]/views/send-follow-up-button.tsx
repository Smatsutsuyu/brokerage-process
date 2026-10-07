"use client";

import { OFFERS_FOLLOWUP_TEMPLATE } from "@/lib/email-templates";

import { BuyerBlastButton } from "./buyer-blast-button";

// "Send follow-up": nudge green/yellow buyers who haven't submitted an
// offer. One component for both entry points, the Phase 2 "Follow up
// missing offers" checklist row (compact) and the Contacts tab toolbar.
export function SendFollowUpButton({
  dealId,
  compact = true,
}: {
  dealId: string;
  compact?: boolean;
}) {
  return (
    <BuyerBlastButton
      dealId={dealId}
      label="Send follow-up"
      modalTitle="Follow-up to non-responders"
      title="Filter to green/yellow buyers who haven't submitted an offer yet (Offer flag unchecked on the contacts card)."
      template={OFFERS_FOLLOWUP_TEMPLATE}
      defaultTiers={["green", "yellow"]}
      excludeOfferReceived
      compact={compact}
    />
  );
}
