"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail, Plus } from "lucide-react";

import { PlannedAction } from "@/components/planned-action";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { addQaItem, approveAllQaItems } from "../actions";

import { QaEntry } from "./qa-entry";
import { QaFilePdfButton } from "./qa-file-pdf-button";

export type QaRow = {
  id: string;
  question: string | null;
  answer: string | null;
  approved: boolean;
  approvedAt: string | null;
};

type QaListProps = {
  dealId: string;
  items: QaRow[];
};

export function QaList({ dealId, items }: QaListProps) {
  const [addingPending, startAdd] = useTransition();
  const [approveAllPending, startApproveAll] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = items.length;
  const approved = items.filter((i) => i.approved).length;
  const pending = total - approved;

  function handleAdd() {
    setError(null);
    startAdd(async () => {
      try {
        await addQaItem({ dealId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add Q&A entry.");
      }
    });
  }

  function handleApproveAll() {
    setError(null);
    startApproveAll(async () => {
      try {
        await approveAllQaItems({ dealId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not approve all.");
      }
    });
  }

  return (
    <div className="qa-container space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Q&amp;A status
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-semibold tabular-nums">{approved}</span> approved ·{" "}
          <span className="font-semibold tabular-nums">{pending}</span> pending
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleApproveAll}
            disabled={approveAllPending || pending === 0}
            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
          >
            {approveAllPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve all
          </Button>
          <QaFilePdfButton dealId={dealId} />
          <PlannedAction
            label="Send Q&A"
            icon={Mail}
            feature="Q&A distribution shortcut"
            description="Tab-level shortcut to the Phase 2 'Send Q&A' tier-filtered blast. Currently lives on the Q&A File checklist row; will be mirrored here next."
            phase="phase_2"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <h2 className="mb-1 text-base font-semibold text-gray-700">No Q&amp;A items yet</h2>
          <p className="mb-4 text-sm text-gray-500">
            Click the button below to add your first question.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <QaEntry key={item.id} dealId={dealId} item={item} index={idx + 1} />
          ))}
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleAdd}
          disabled={addingPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600",
            addingPending && "opacity-60",
          )}
        >
          {addingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Q&amp;A item
        </button>
      </div>
    </div>
  );
}
