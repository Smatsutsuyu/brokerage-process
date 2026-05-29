"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

type InternalMarketingReportPdfButtonProps = {
  dealId: string;
};

// Opens the Internal Marketing Report (denser, internal-only view of
// the Cards tab) in a new tab. Sibling to MarketingReportPdfButton —
// same pattern, different route.
export function InternalMarketingReportPdfButton({
  dealId,
}: InternalMarketingReportPdfButtonProps) {
  const baseHref = `/api/deals/${dealId}/internal-marketing-report.pdf`;
  const title =
    "Open the Internal Marketing Report (full Cards tab snapshot) in a new tab";

  function openFresh() {
    window.open(`${baseHref}?t=${Date.now()}`, "_blank");
  }

  return (
    <Button size="sm" variant="outline" onClick={openFresh} title={title}>
      <FileText className="h-3.5 w-3.5" />
      Internal Report
    </Button>
  );
}
