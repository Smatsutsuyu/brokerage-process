"use client";

import { Send } from "lucide-react";

import { ISSUES_REPORT_TEMPLATE } from "@/lib/email-templates";

import { DealTeamSendButton } from "./deal-team-send-button";
import { IssuesReportPdfButton } from "./issues-report-pdf-button";

type IssuesRowActionsProps = {
  dealId: string;
};

// Pair of actions on the Phase 4 "Issues Tracking Sheet" row:
//   1. Generate PDF -> downloads the on-demand issues report (shared
//      component; same destination as the Issues tab toolbar button).
//   2. Send to Deal Team -> opens the email composer with the PDF
//      pre-attached and Deal Team recipients (owner + broker, plus
//      buyer once one's been selected) pre-populated.
//
// Matches the Excel functionality column for the row: "PDF Report and
// Send to those checked on deal team from Roster Report."
export function IssuesRowActions({ dealId }: IssuesRowActionsProps) {
  const pdfUrl = `/api/deals/${dealId}/issues-report.pdf`;

  return (
    <>
      <IssuesReportPdfButton dealId={dealId} variant="compact" />
      <DealTeamSendButton
        dealId={dealId}
        label="Send to Deal Team"
        title="Email the issues report to the Deal Team (owner + broker + buyer, filtered by include-in-emails)"
        icon={Send}
        modalTitle="Issues report"
        template={ISSUES_REPORT_TEMPLATE}
        teams={["owner", "broker", "buyer"]}
        attachments={[
          {
            id: "issues-report-pdf",
            kind: "link",
            url: pdfUrl,
            label: "Issues Report PDF",
          },
        ]}
      />
    </>
  );
}
