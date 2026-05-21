"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Generic "preview a PDF, then continue or cancel" step body. Caller
// owns the surrounding Dialog wrapper + step state; this component just
// renders the header, the iframe, and the footer buttons. Designed to
// drop into any multi-step flow that wants "review the PDF, then move
// on to send / save / approve / etc."
//
// The iframe URL is opaque to this component — caller is responsible
// for cache-busting (?t=Date.now()) if the underlying route caches.
// The "Open in new tab" link gives users a path out when the inline
// viewer fails (some browsers / extensions block embedded PDFs).
//
// Sizing: parent <DialogContent> should set its own width + height.
// The iframe takes up all available vertical space inside the dialog
// between header and footer via flex-1 + min-h-0.

type PdfPreviewStepProps = {
  // The URL the iframe loads. Caller cache-busts if needed.
  pdfUrl: string;
  // Header text and optional subtitle.
  title: string;
  description?: string;
  // Footer button labels. Defaults: "Cancel" / "Continue".
  cancelLabel?: string;
  continueLabel?: string;
  // Footer button callbacks. onCancel typically closes the dialog;
  // onContinue typically advances the parent's step state.
  onCancel: () => void;
  onContinue: () => void;
  // Optional disabled state for the Continue button (e.g. while a
  // parent operation is in flight after the user clicks Continue).
  continueDisabled?: boolean;
};

export function PdfPreviewStep({
  pdfUrl,
  title,
  description,
  cancelLabel = "Cancel",
  continueLabel = "Continue",
  onCancel,
  onContinue,
  continueDisabled,
}: PdfPreviewStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <iframe
          src={pdfUrl}
          title={title}
          className="min-h-0 w-full flex-1 rounded border border-gray-200 bg-gray-50"
        />
        <div className="text-right text-[11px] text-gray-500">
          PDF not rendering?{" "}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener"
            className="hover:text-brand-blue inline-flex items-center gap-0.5 underline"
          >
            Open in new tab
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button onClick={onContinue} disabled={continueDisabled}>
          {continueLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
