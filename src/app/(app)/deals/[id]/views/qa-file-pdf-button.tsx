"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QaFilePdfButtonProps = {
  dealId: string;
  // "default" = full button chrome (used on Q&A tab toolbar).
  // "compact" = small text+icon link (used inline on the Phase 2 Q&A
  // File checklist row alongside the Send Q&A button).
  variant?: "default" | "compact";
};

// Single source for "open the per-deal Q&A File PDF in a new tab."
// Used on the Q&A tab toolbar AND on the Phase 2 Q&A File checklist
// row so both surfaces share one destination + label.
export function QaFilePdfButton({
  dealId,
  variant = "default",
}: QaFilePdfButtonProps) {
  const href = `/api/deals/${dealId}/qa-file.pdf`;
  const title = "Open the per-deal Q&A File PDF in a new tab (approved items only)";

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
      Q&amp;A File
    </Button>
  );
}
