"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DdTrackingPdfButtonProps = {
  dealId: string;
  // "default" = full button chrome (used on Issues tab toolbar).
  // "compact" = small text+icon link (used inline on the Phase 4
  // Complete Due Diligence checklist row alongside Send to Deal Team).
  variant?: "default" | "compact";
};

// Single source for "open the per-deal Due Diligence Tracking PDF in a
// new tab." Used on the Issues tab toolbar AND on the Phase 4 Complete
// Due Diligence checklist row so both surfaces share one destination
// and label.
export function DdTrackingPdfButton({ dealId, variant = "default" }: DdTrackingPdfButtonProps) {
  const baseHref = `/api/deals/${dealId}/dd-tracking.pdf`;
  const title = "Open the per-deal Due Diligence Tracking PDF in a new tab";

  // Cache-bust per click: some browsers serve a cached PDF for new-tab
  // navigations even when the response is Cache-Control: no-store.
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
        Generate PDF
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={openFresh} title={title}>
      <FileText className="h-3.5 w-3.5" />
      Due Diligence Tracking
    </Button>
  );
}
