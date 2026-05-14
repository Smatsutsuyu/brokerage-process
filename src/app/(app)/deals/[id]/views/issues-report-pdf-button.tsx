"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IssuesReportPdfButtonProps = {
  dealId: string;
  // "default" = full button chrome (used on Issues tab toolbar).
  // "compact" = small text+icon link (used inline on the Phase 4 Issues
  // Tracking checklist row alongside the Send to Deal Team button).
  variant?: "default" | "compact";
};

// Single source for "open the per-deal Issues Report PDF in a new tab."
// Used on the Issues tab toolbar AND on the Phase 4 Issues Tracking
// checklist row so both surfaces share one destination + label.
export function IssuesReportPdfButton({
  dealId,
  variant = "default",
}: IssuesReportPdfButtonProps) {
  const href = `/api/deals/${dealId}/issues-report.pdf`;
  const title = "Download the per-deal Issues Report PDF";

  if (variant === "compact") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        title={title}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <FileText className="h-3 w-3" />
        Generate PDF
      </a>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => window.open(href, "_blank")}
      title={title}
    >
      <FileText className="h-3.5 w-3.5" />
      Issues Report
    </Button>
  );
}
