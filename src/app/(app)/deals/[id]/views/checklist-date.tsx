"use client";

import { useRef, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { setChecklistItemDate } from "../actions";

type ChecklistDateProps = {
  itemId: string;
  dealId: string;
  // YYYY-MM-DD or null.
  value: string | null;
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

// Renders a milestone-date chip on a checklist row. Empty state is a
// "+ Date" button that, on click, immediately saves today's date (no
// picker). Once set, the chip displays the formatted date and clicking
// opens the native picker pre-filled with the current value.
//
// Why two states and not "always show the picker": browser date inputs
// don't have great empty-state UX. The button form makes the affordance
// readable when nothing is set, and the one-click "set to today" matches
// Chris's pattern (he updates these on the day the milestone happens).
export function ChecklistDate({ itemId, dealId, value }: ChecklistDateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function commit(next: string | null) {
    startTransition(async () => {
      await setChecklistItemDate({ itemId, dealId, date: next });
    });
  }

  function handleSetToday() {
    commit(localTodayIso());
  }

  function handleEditClick() {
    // showPicker() is supported in modern Chromium / Firefox / Safari.
    // Older browsers fall back to focusing the input, which still works
    // (user can type or use the native control).
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
    }
  }

  if (value === null) {
    return (
      <button
        type="button"
        onClick={handleSetToday}
        disabled={isPending}
        title="Set this item's milestone date to today. Click again after setting to change."
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CalendarDays className="h-3 w-3" />
        )}
        + Date
      </button>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleEditClick}
        disabled={isPending}
        title="Click to change the date. Right-click the chip or pick a new date to clear via the input."
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 transition-colors hover:bg-blue-100",
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CalendarDays className="h-3 w-3" />
        )}
        {formatDateLabel(value)}
      </button>
      {/* Hidden native date input. Click on the chip triggers
          showPicker() against this. Positioned absolutely so it doesn't
          take layout space; opacity-0 keeps it invisible without
          hiding it from the picker mechanism. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => commit(e.target.value || null)}
        className="pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </span>
  );
}
