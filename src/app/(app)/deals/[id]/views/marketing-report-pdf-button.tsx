"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MarketingReportPdfButtonProps = {
  dealId: string;
  // "default" = full button chrome (used on Contacts tab toolbar).
  // "compact" = small text+icon link (used inline on the Phase 1
  // Marketing Report checklist row alongside other planned actions).
  variant?: "default" | "compact";
};

// Single source for "open the per-deal Marketing Report PDF in a new
// tab." Used on the Contacts tab toolbar AND on the Phase 1 Marketing
// Report checklist row so both surfaces share the same destination
// without copy-pasted onClick handlers.
export function MarketingReportPdfButton({
  dealId,
  variant = "default",
}: MarketingReportPdfButtonProps) {
  const baseHref = `/api/deals/${dealId}/marketing-report.pdf`;
  const title = "Open the per-builder Marketing Report PDF in a new tab";

  // Cache-bust per click: some browsers serve a cached PDF for new-tab
  // navigations even when the response is Cache-Control: no-store. A
  // unique query param ensures each click hits the server fresh.
  function openFresh() {
    window.open(`${baseHref}?t=${Date.now()}`, "_blank");
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={openFresh}
        title={title}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <FileText className="h-3 w-3" />
        Marketing Report
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={openFresh} title={title}>
      <FileText className="h-3.5 w-3.5" />
      Marketing Report
    </Button>
  );
}
