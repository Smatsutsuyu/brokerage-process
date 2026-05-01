"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { cn } from "@/lib/utils";

import { deleteQaItem, setQaApproved, updateQaItem } from "../actions";

import type { QaRow } from "./qa-list";

type QaEntryProps = {
  dealId: string;
  item: QaRow;
  index: number;
};

export function QaEntry({ dealId, item, index }: QaEntryProps) {
  // Pending entries are locked-by-default with an Edit button. Brand-new
  // empty entries (just created via "+ Add Q&A") start in editing mode.
  // Approved entries always display read-only.
  const isBrandNew = !item.question?.trim() && !item.answer?.trim() && !item.approved;

  const [question, setQuestion] = useState(item.question ?? "");
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [isEditing, setIsEditing] = useState(isBrandNew);
  const [savePending, startSave] = useTransition();
  const [approvePending, startApprove] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const confirm = useConfirm();

  function handleSave() {
    const dirtyQ = question !== (item.question ?? "");
    const dirtyA = answer !== (item.answer ?? "");
    if (!dirtyQ && !dirtyA) {
      setIsEditing(false);
      return;
    }
    startSave(async () => {
      await updateQaItem({ dealId, qaId: item.id, question, answer });
      setIsEditing(false);
    });
  }

  async function handleCancel() {
    // A brand-new entry that was never filled in should be cleaned up rather
    // than left as an empty row.
    if (isBrandNew) {
      startDelete(async () => {
        await deleteQaItem({ dealId, qaId: item.id });
      });
      return;
    }
    setQuestion(item.question ?? "");
    setAnswer(item.answer ?? "");
    setIsEditing(false);
  }

  function handleApproveToggle() {
    startApprove(async () => {
      await setQaApproved({ dealId, qaId: item.id, approved: !item.approved });
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this Q&A entry?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteQaItem({ dealId, qaId: item.id });
    });
  }

  const isApproved = item.approved;
  const showLockedView = !isEditing;
  const hasContent = question.trim() && answer.trim();

  return (
    <article
      className={cn(
        "relative rounded-xl bg-white p-5 shadow-sm",
        "border-l-[3px]",
        isApproved ? "border-l-green-500 bg-green-50/40" : "border-l-blue-500",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] font-bold tracking-wider uppercase",
              isApproved ? "text-green-700" : "text-blue-600",
            )}
          >
            Q&amp;A #{index}
          </span>
          {isApproved && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
              Approved
            </span>
          )}
          {savePending && (
            <span className="text-[10px] text-gray-400 italic">Saving…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isApproved ? (
            <button
              type="button"
              onClick={handleApproveToggle}
              disabled={approvePending}
              title="Unapprove (return to draft)"
              className="flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
            >
              {approvePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
              Unapprove
            </button>
          ) : isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={savePending || deletePending}
                title="Cancel editing"
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={savePending}
                title="Save and lock"
                className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                title="Edit entry"
                className="flex items-center gap-1 rounded-md bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-200"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={handleApproveToggle}
                disabled={approvePending || !hasContent}
                title={
                  !hasContent
                    ? "Fill in both question and answer first"
                    : "Approve this Q&A"
                }
                className="flex items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800 hover:bg-green-200 disabled:opacity-50"
              >
                {approvePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </button>
            </>
          )}
          {!isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              title="Delete entry"
              className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </header>

      {showLockedView ? (
        <div className="space-y-2 text-sm leading-relaxed text-gray-700">
          {item.question?.trim() ? (
            <p className="font-bold">Q: {item.question}</p>
          ) : (
            <p className="text-gray-400 italic">Q: (no question yet)</p>
          )}
          {item.answer?.trim() ? (
            <p>A: {item.answer}</p>
          ) : (
            <p className="text-gray-400 italic">A: (no answer yet)</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              Question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type the question…"
              rows={2}
              autoFocus
              className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              Answer
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type the answer…"
              rows={3}
              className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      )}
    </article>
  );
}
