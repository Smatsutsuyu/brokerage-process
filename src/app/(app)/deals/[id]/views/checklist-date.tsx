"use client";

import { useRef, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { setChecklistItemDate, type ChecklistDateKind } from "../actions";

type ChecklistDateProps = {
  itemId: string;
  dealId: string;
  // Both YYYY-MM-DD or null. `value` is the actual date (tracked_date),
  // kept as the primary because every existing row already holds one.
  value: string | null;
  estimate: string | null;
};

// Returns today's date as YYYY-MM-DD in the browser's local timezone.
// We use local time on purpose: these milestones are "when did the
// event happen for me," not UTC instants. Server stores the string
// verbatim into a date column (no timezone shifting).
function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Formats YYYY-MM-DD into a friendly label like "May 15, 2026". Parses
// the string manually instead of `new Date(value)` so we don't get
// bitten by browsers interpreting bare YYYY-MM-DD as UTC midnight (then
// shifting back into the previous day in negative-offset timezones).
function formatDateLabel(iso: string): string {
  const [yStr, mStr, dStr] = iso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return iso;
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type ChipProps = {
  itemId: string;
  dealId: string;
  kind: ChecklistDateKind;
  value: string | null;
};

// One date chip. Two of these render per milestone row, one per kind.
//
// Empty state is a labelled "+ Est." / "+ Actual" button. Estimate opens
// the picker straight away, because a projection is rarely today. Actual
// saves today's date in one click, which is how Chris uses it: he opens
// the deal on the day a milestone lands and stamps it.
function DateChip({ itemId, dealId, kind, value }: ChipProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const isEstimate = kind === "estimate";
  const label = isEstimate ? "Est." : "Actual";

  function commit(next: string | null) {
    startTransition(async () => {
      await setChecklistItemDate({ itemId, dealId, date: next, kind });
    });
  }

  function openPicker() {
    // showPicker() is supported in modern Chromium / Firefox / Safari.
    // Older browsers fall back to focusing the input, which still works
    // (user can type or use the native control).
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  }

  const hidden = (
    <input
      ref={inputRef}
      type="date"
      value={value ?? ""}
      onChange={(e) => commit(e.target.value || null)}
      className="pointer-events-none absolute inset-0 opacity-0"
      tabIndex={-1}
      aria-hidden
    />
  );

  if (value === null) {
    return (
      <span className="relative inline-flex items-center">
        <button
          type="button"
          onClick={isEstimate ? openPicker : () => commit(localTodayIso())}
          disabled={isPending}
          title={
            isEstimate
              ? "Set the projected date for this milestone."
              : "Stamp today as the date this milestone actually happened. Click again to change it."
          }
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors",
            isEstimate ? "hover:bg-amber-50 hover:text-amber-700" : "hover:bg-blue-50 hover:text-blue-700",
            isPending && "opacity-60",
          )}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CalendarDays className="h-3 w-3" />
          )}
          + {label}
        </button>
        {hidden}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        title={`${isEstimate ? "Projected" : "Actual"} date. Click to change it, or clear the field in the picker to remove it.`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
          isEstimate
            ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "bg-blue-50 text-blue-800 hover:bg-blue-100",
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CalendarDays className="h-3 w-3" />
        )}
        <span className={cn("opacity-70", isEstimate ? "font-normal" : "font-normal")}>{label}</span>
        {formatDateLabel(value)}
      </button>
      {hidden}
    </span>
  );
}

// Milestone dates on a checklist row: the projected date and the date it
// actually landed, side by side.
//
// Both are always offered. Chris asked for "[Estimate / Actual] options"
// and the two-field reading is the useful one: a milestone carries a
// projection and an outcome at once, and the gap between them is what
// makes slip visible. A single toggled date would have forced a choice
// and thrown away whichever one was not selected.
//
// Estimate renders first because it is set first in the life of a deal.
export function ChecklistDate({ itemId, dealId, value, estimate }: ChecklistDateProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <DateChip itemId={itemId} dealId={dealId} kind="estimate" value={estimate} />
      <DateChip itemId={itemId} dealId={dealId} kind="actual" value={value} />
    </span>
  );
}
