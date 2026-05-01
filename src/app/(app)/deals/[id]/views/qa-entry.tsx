"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { deleteQaItem, setQaApproved, updateQaItem } from "../actions";

import type { QaRow } from "./qa-list";

type QaEntryProps = {
  dealId: string;
  item: QaRow;
  index: number;
};

export function QaEntry({ dealId, item, index }: QaEntryProps) {
  // Approved entries display read-only; click "Edit" to unapprove + reveal
  // textareas. Pending entries are always editable.
  const [question, setQuestion] = useState(item.question ?? "");
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [savePending, startSave] = useTransition();
  const [approvePending, startApprove] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function saveIfDirty() {
    const dirtyQ = question !== (item.question ?? "");
    const dirtyA = answer !== (item.answer ?? "");
    if (!dirtyQ && !dirtyA) return;
    startSave(async () => {
      await updateQaItem({ dealId, qaId: item.id, question, answer });
    });
  }

  function handleApproveToggle() {
    startApprove(async () => {
      await setQaApproved({ dealId, qaId: item.id, approved: !item.approved });
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this Q&A entry?")) return;
    startDelete(async () => {
      await deleteQaItem({ dealId, qaId: item.id });
    });
  }

  const isApproved = item.approved;

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
          ) : (
            <button
              type="button"
              onClick={handleApproveToggle}
              disabled={approvePending || !question.trim() || !answer.trim()}
              title={
                !question.trim() || !answer.trim()
                  ? "Fill in both question and answer first"
                  : "Approve this Q&A"
              }
              className="flex items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800 hover:bg-green-200 disabled:opacity-50"
            >
              {approvePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Approve
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deletePending}
            title="Delete entry"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {isApproved ? (
        <div className="space-y-2 text-sm leading-relaxed text-gray-700">
          <p className="font-bold">Q: {item.question}</p>
          <p>A: {item.answer}</p>
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
              onBlur={saveIfDirty}
              placeholder="Type the question…"
              rows={2}
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
              onBlur={saveIfDirty}
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
