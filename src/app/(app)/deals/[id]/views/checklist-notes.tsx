"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, NotebookPen, Pencil, Trash2, X } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { setChecklistItemNotes } from "../actions";

// Trigger button shown in the main row's action area. Only renders when
// no notes exist yet — once a note is saved, it's shown inline below the
// row (via <ChecklistNotesPanel>) and that panel owns its own Edit
// affordance.
export function ChecklistNotesAddButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      title="Add notes"
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700"
    >
      <NotebookPen className="h-3 w-3" />
      Note
    </button>
  );
}

type ChecklistNotesPanelProps = {
  dealId: string;
  itemId: string;
  notes: string | null;
  // Whether the panel is in edit mode (textarea visible). View mode renders
  // the saved notes as plain text with Edit/Clear affordances. Owned by the
  // parent so the row can decide when to flip into editing (e.g. from the
  // "Add note" button click).
  editing: boolean;
  onEditingChange: (next: boolean) => void;
};

// Renders the per-item notes block beneath the row. Two modes:
// - View (notes && !editing): saved notes shown as wrapped text with Edit
//   and Clear icons. Always visible at-a-glance when notes are present.
// - Edit (editing): textarea + save/cancel. Cmd/Ctrl+Enter saves, Esc
//   cancels.
// The parent should only render this when (notes || editing) — there's
// nothing to show otherwise.
export function ChecklistNotesPanel({
  dealId,
  itemId,
  notes,
  editing,
  onEditingChange,
}: ChecklistNotesPanelProps) {
  const [draft, setDraft] = useState(notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [, startClear] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();

  // Resync draft when the parent passes a new `notes` value (e.g. someone
  // else edited via revalidation, or we just saved). Also reset draft when
  // entering edit mode so the textarea starts from the current saved value.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraft(notes ?? "");
  }, [notes, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!editing) return;
    textareaRef.current?.focus();
    const len = textareaRef.current?.value.length ?? 0;
    textareaRef.current?.setSelectionRange(len, len);
  }, [editing]);

  function handleSave() {
    startTransition(async () => {
      await setChecklistItemNotes({ itemId, dealId, notes: draft });
      onEditingChange(false);
    });
  }

  function handleCancel() {
    setDraft(notes ?? "");
    onEditingChange(false);
  }

  async function handleClear() {
    if (!notes) return;
    const ok = await confirm({
      title: "Clear these notes?",
      description: "The note will be removed from this item. This can't be undone.",
      confirmLabel: "Clear",
      variant: "destructive",
    });
    if (!ok) return;
    startClear(async () => {
      await setChecklistItemNotes({ itemId, dealId, notes: "" });
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  const dirty = draft !== (notes ?? "");

  // Edit mode — textarea + save/cancel.
  if (editing) {
    return (
      <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-3 pl-12 animate-in fade-in slide-in-from-top-1 duration-200">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Working notes for this item — visible to anyone on the deal."
          rows={3}
          className="bg-white text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[10px] text-gray-500">
            ⌘/Ctrl + Enter to save · Esc to cancel
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !dirty}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  // View mode — saved notes shown inline. Whitespace preserved so multi-line
  // notes render naturally; small Edit/Clear icons on the right echo the
  // doc/link sub-row pattern so action affordances are consistent.
  if (!notes) return null;
  return (
    <div
      className={cn(
        // pl-14 (vs pl-12 elsewhere) lines the NotebookPen up with the
        // FileText/Link icon inside the doc/link chip in the attachments
        // sub-row above. Those chips wrap their icon in px-2 of pill
        // padding, so a bare icon at pl-12 sits 8px to the left of them.
        "flex items-center gap-2 border-t border-gray-100 bg-gray-50/40 px-5 py-2 pl-14",
        "animate-in fade-in slide-in-from-top-1 duration-200",
      )}
    >
      <NotebookPen className="h-3 w-3 flex-shrink-0 text-gray-500" />
      <div className="flex-1 text-[12px] leading-relaxed whitespace-pre-wrap text-gray-700">
        {notes}
      </div>
      <div className="flex flex-shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onEditingChange(true)}
          title="Edit note"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-amber-100 hover:text-amber-700"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleClear}
          title="Clear note"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
