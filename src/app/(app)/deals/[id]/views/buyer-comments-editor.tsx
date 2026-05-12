"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { setBuyerComments } from "../actions";

type BuyerCommentsEditorProps = {
  dealBuyerId: string;
  dealId: string;
  initialComments: string | null;
};

// Inline textarea for the per-builder "interest" comments that surface in
// the Marketing Report PDF. Save-on-blur (or ⌘/Ctrl+Enter); empty string
// clears. Optimistic local state so typing feels immediate; the spinner
// appears only while the save is in flight.
export function BuyerCommentsEditor({
  dealBuyerId,
  dealId,
  initialComments,
}: BuyerCommentsEditorProps) {
  const [value, setValue] = useState(initialComments ?? "");
  const [isPending, startTransition] = useTransition();
  // Last value we successfully persisted (or accepted as the source of
  // truth from the prop). Compared on blur to skip no-op saves.
  const lastSavedRef = useRef<string>(initialComments ?? "");

  // Resync if the prop changes from outside (e.g. another tab edited it
  // and revalidation pushed new data down). The set-state-in-effect lint
  // rule fires here, but the disable is intentional: this is the canonical
  // "controlled input syncs to upstream changes" pattern, not a render-loop.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setValue(initialComments ?? "");
    lastSavedRef.current = initialComments ?? "";
  }, [initialComments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function save() {
    const next = value.trim();
    if (next === lastSavedRef.current.trim()) return;
    startTransition(async () => {
      try {
        await setBuyerComments({ dealBuyerId, dealId, comments: next });
        lastSavedRef.current = next;
      } catch (err) {
        console.error("[buyer-comments] save failed", err);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // Triggers save via onBlur
    }
  }

  return (
    <div className="rounded border border-blue-200 bg-blue-50/30 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
          Interest comments
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : (
            <span>⌘/Ctrl + Enter to save · auto-saves on blur</span>
          )}
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder="What did this builder say about the deal? (Surfaces in the Marketing Report PDF.)"
        rows={2}
        className={cn("bg-white text-[13px]", isPending && "opacity-70")}
      />
    </div>
  );
}
