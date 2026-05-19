"use client";

import { Send } from "lucide-react";

import { DD_TRACKING_TEMPLATE } from "@/lib/email-templates";

import { DealTeamSendButton } from "./deal-team-send-button";
import { DdTrackingPdfButton } from "./dd-tracking-pdf-button";

type DdTrackingRowActionsProps = {
  dealId: string;
};

// Pair of actions on the Phase 4 "Complete Due Diligence" row:
//   1. Generate PDF -> opens the combined Due Diligence Tracking PDF
//      (key dates + issues + deal team + consultants).
//   2. Send to Deal Team -> opens the email composer with the PDF
//      pre-attached and Deal Team recipients (owner + broker + buyer,
//      filtered by include-in-emails) pre-populated.
//
// Matches the Excel functionality column for the row: "PDF Report and
// Send to those checked on deal team from Roster Report."
export function DdTrackingRowActions({ dealId }: DdTrackingRowActionsProps) {
  const pdfUrl = `/api/deals/${dealId}/dd-tracking.pdf`;

  return (
    <>
      <DdTrackingPdfButton dealId={dealId} variant="compact" />
      <DealTeamSendButton
        dealId={dealId}
        label="Send to Deal Team"
        title="Email the Due Diligence Tracking report to the Deal Team (owner + broker + buyer, filtered by include-in-emails)"
        icon={Send}
        modalTitle="Due Diligence Tracking"
        template={DD_TRACKING_TEMPLATE}
        teams={["owner", "broker", "buyer"]}
        attachments={[
          {
            id: "dd-tracking-pdf",
            kind: "link",
            url: pdfUrl,
            label: "Due Diligence Tracking PDF",
          },
        ]}
      />
    </>
  );
}
