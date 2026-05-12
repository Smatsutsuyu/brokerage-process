"use client";

import { useEffect, useRef, useState, useTransition } from "react";
// (useRef kept — used only for the textarea DOM ref, not for derived state.)
import { Loader2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { setBuyerComments } from "../actions";

type BuyerCommentsEditorProps = {
  dealBuyerId: string;
  dealId: string;
  initialComments: string | null;
};

// Three-state editor for the per-builder "interest" comments. Mirrors the
// checklist-notes pattern so the UI vocabulary stays consistent:
//   - empty   → low-key "+ Add comment" button (no visual noise when blank)
//   - display → readable text with Edit + Clear affordances
//   - edit    → textarea, save-on-blur (or ⌘/Ctrl+Enter)
// Empty content saved while editing collapses back to empty mode; saving a
// non-empty value flips to display.
export function BuyerCommentsEditor({
  dealBuyerId,
  dealId,
  initialComments,
}: BuyerCommentsEditorProps) {
  const trimmedInitial = (initialComments ?? "").trim();
  // savedValue lives in state (not a ref) so it drives render output
  // safely — the display vs empty branch reads it at render time. The
  // useEffect below resyncs it when the prop changes externally.
  const [savedValue, setSavedValue] = useState(trimmedInitial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trimmedInitial);
  const [isPending, startTransition] = useTransition();
  const [, startClear] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();

  // Resync from prop changes (other tab edited, revalidation pushed new
  // data down). The set-state-in-effect lint rule fires here but this is
  // the canonical "controlled input syncs to upstream changes" pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraft(trimmedInitial);
    setSavedValue(trimmedInitial);
  }, [trimmedInitial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Autofocus + cursor-to-end when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    textareaRef.current?.focus();
    const len = textareaRef.current?.value.length ?? 0;
    textareaRef.current?.setSelectionRange(len, len);
  }, [editing]);

  function save() {
    const next = draft.trim();
    if (next === savedValue) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await setBuyerComments({ dealBuyerId, dealId, comments: next });
        setSavedValue(next);
        setEditing(false);
      } catch (err) {
        console.error("[buyer-comments] save failed", err);
      }
    });
  }

  function cancel() {
    setDraft(savedValue);
    setEditing(false);
  }

  async function clear() {
    if (!savedValue) {
      setEditing(false);
      return;
    }
    const ok = await confirm({
      title: "Clear comment?",
      description: "Removes the interest comment for this builder. This can't be undone.",
      confirmLabel: "Clear",
      variant: "destructive",
    });
    if (!ok) return;
    startClear(async () => {
      try {
        await setBuyerComments({ dealBuyerId, dealId, comments: "" });
        setSavedValue("");
        setDraft("");
        setEditing(false);
      } catch (err) {
        console.error("[buyer-comments] clear failed", err);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  // Edit mode — textarea + save-on-blur.
  if (editing) {
    return (
      <div className="rounded border border-blue-200 bg-blue-50/30 px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
            Interest comments
          </div>
          <div className="text-[10px] text-gray-500">
            {isPending ? (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </span>
            ) : (
              <span>⌘/Ctrl + Enter saves · Esc cancels · auto-saves on blur</span>
            )}
          </div>
        </div>
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          placeholder="What did this builder say about the deal? (Surfaces in the Marketing Report PDF.)"
          rows={2}
          className={cn("bg-white text-[13px]", isPending && "opacity-70")}
        />
      </div>
    );
  }

  // Display mode — readable text + Edit / Clear affordances.
  if (savedValue) {
    return (
      <div className="group flex items-start gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <MessageSquarePlus className="mt-0.5 h-3 w-3 flex-shrink-0 text-gray-400" />
        <div className="flex-1 text-[13px] leading-relaxed whitespace-pre-wrap text-gray-700">
          {savedValue}
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit comment"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-700"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={clear}
            title="Clear comment"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // Empty mode — single low-key trigger. Compact so it doesn't dominate
  // the expanded card body when the user just wants to glance at the
  // contacts list.
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700"
    >
      <MessageSquarePlus className="h-3 w-3" />
      Add comment
    </button>
  );
}
