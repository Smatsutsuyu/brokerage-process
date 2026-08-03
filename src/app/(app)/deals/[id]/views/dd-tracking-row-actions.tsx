"use client";

import { Send } from "lucide-react";

import { DD_TRACKING_TEMPLATE } from "@/lib/email-templates";

import { DdTrackingPdfButton } from "./dd-tracking-pdf-button";
import { UnifiedDealTeamSendButton } from "./unified-deal-team-send-button";

type DdTrackingRowActionsProps = {
  dealId: string;
};

// Pair of actions on the Phase 4 "Complete Due Diligence" row:
//   1. Generate PDF -> opens the combined Due Diligence Tracking PDF
//      (key dates + issues + deal team + consultants).
//   2. Send to Deal Team -> opens the email composer with the PDF
//      pre-attached and Deal Team recipients pre-populated as ONE email:
//      ownership + buyer on the To line, the brokerage CC'd, consultants
//      available from the CC picker.
//
// Matches the Excel functionality column for the row: "PDF Report and
// Send to those checked on deal team from Roster Report."
export function DdTrackingRowActions({ dealId }: DdTrackingRowActionsProps) {
  return (
    <>
      <DdTrackingPdfButton dealId={dealId} variant="compact" />
      <UnifiedDealTeamSendButton
        dealId={dealId}
        label="Send to Deal Team"
        title="Email the Due Diligence Tracking report to the Deal Team as one email (ownership + buyer on To, brokerage CC'd)"
        icon={Send}
        modalTitle="Due Diligence Tracking"
        template={DD_TRACKING_TEMPLATE}
        // kind: "generated" — the PDF is rendered server-side at send
        // time and attached as real bytes. This was kind: "link" until
        // 2026-08-03, pointing at the relative /api/deals/<id>/
        // dd-tracking.pdf route; link attachments get concatenated into
        // the message body as text, so recipients received a bare
        // session-gated path and never got the report.
        attachments={[
          {
            id: "dd-tracking-pdf",
            kind: "generated",
            generator: "dd-tracking",
            filename: "Due Diligence Tracking.pdf",
          },
        ]}
        // Review the report before composing, matching the Marketing
        // Report / Consultant Roster / Deal Status sends. The preview
        // and the attachment render from the same loader, so what you
        // approve here is what recipients receive.
        previewPdf={{
          path: `/api/deals/${dealId}/dd-tracking.pdf`,
          title: "Due Diligence Tracking preview",
          description:
            "Review the freshly-generated report before continuing to the email composer.",
        }}
      />
    </>
  );
}
