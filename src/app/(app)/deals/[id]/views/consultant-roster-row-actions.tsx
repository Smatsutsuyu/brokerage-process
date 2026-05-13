"use client";

import { Send } from "lucide-react";

import { CONSULTANT_ROSTER_TEMPLATE } from "@/lib/email-templates";

import { DealTeamSendButton } from "./deal-team-send-button";

type ConsultantRosterRowActionsProps = {
  dealId: string;
};

// Phase 4 "Create Consultant Roster & Send Out" row. The tab-link to
// the Consultants tab is already rendered via the linksTo lookup on
// the row; this component adds the "Send to Deal Team" affordance.
// No PDF generation yet (consultants can be sent as a link to the
// Consultants tab, or pasted inline once we render the roster as a PDF
// follow-up). For now we attach nothing and let Chris edit the body.
export function ConsultantRosterRowActions({
  dealId,
}: ConsultantRosterRowActionsProps) {
  return (
    <DealTeamSendButton
      dealId={dealId}
      label="Send to Deal Team"
      title="Email the consultant roster to the Deal Team"
      icon={Send}
      modalTitle="Consultant roster"
      template={CONSULTANT_ROSTER_TEMPLATE}
      teams={["owner", "broker", "buyer"]}
      attachments={[]}
    />
  );
}
