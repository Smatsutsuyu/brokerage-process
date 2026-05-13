"use client";

import { FileText, Send } from "lucide-react";

import { ISSUES_REPORT_TEMPLATE } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

import { DealTeamSendButton } from "./deal-team-send-button";

type IssuesRowActionsProps = {
  dealId: string;
};

// Pair of actions on the Phase 4 "Issues Tracking Sheet" row:
//   1. Generate PDF -> downloads the on-demand issues report
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
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener"
        title="Generate and download the issues report PDF"
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <FileText className="h-3 w-3" />
        Generate PDF
      </a>
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
