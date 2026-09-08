"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { setChecklistItemDate } from "../actions";

type ChecklistDateProps = {
  itemId: string;
  dealId: string;
  // Both YYYY-MM-DD or null, straight from the two columns.
  value: string | null;
  estimate: string | null;
  // The item's own completion checkbox. Drives the "Completed" label only;
  // this component never writes it.
  completed: boolean;
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

// One milestone date per row, plus an "Est." checkbox that says whether the
// date is a projection or a real one.
//
// Two columns are still kept underneath. The checkbox picks which one the
// write lands in, so the projection survives being promoted and the gap
// between the two stays reportable, without asking anyone to maintain two
// fields. Which column holds the value is also what drives the checkbox:
//
//   tracked_date set   -> unticked, a firm date (may be future or past)
//   only estimated_date -> ticked, a projection
//   item completed      -> "Completed" prefix, whichever column the date is in
//
// The displayed date is `tracked_date ?? estimated_date`, which is the same
// expression every read site and the overdue check already used, so no data
// moved when this replaced the two-chip layout.
export function ChecklistDate({
  itemId,
  dealId,
  value,
  estimate,
  completed,
}: ChecklistDateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  // Only meaningful while the row has no date yet: it holds the intended kind
  // until there is a value to attach it to. Once a date exists the checkbox is
  // driven by which column holds it, not by local state.
  const [draftEstimate, setDraftEstimate] = useState(false);

  const isEstimate = value === null && estimate !== null;
  const shown = value ?? estimate;

  function commit(next: string | null, asEstimate: boolean) {
    startTransition(async () => {
      await setChecklistItemDate({ itemId, dealId, date: next, isEstimate: asEstimate });
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

  // The picker writes back under whichever mode the row is currently in.
  // Editing a date never changes its kind; only the checkbox does that.
  const hidden = (
    <input
      ref={inputRef}
      type="date"
      // Defaulting an empty field to today means the common case (a milestone
      // that just landed) is click, confirm. A firm future date such as a
      // closing is still one pick away, which is why this is a default rather
      // than an auto-stamp.
      value={shown ?? localTodayIso()}
      onChange={(e) => commit(e.target.value || null, shown === null ? draftEstimate : isEstimate)}
      className="pointer-events-none absolute inset-0 opacity-0"
      tabIndex={-1}
      aria-hidden
    />
  );

  // Ticking Est. demotes the shown date to a projection. Unticking promotes it,
  // and stamps TODAY rather than carrying the projection over: a projection
  // accepted unchanged as the actual would record every milestone as landing
  // exactly on schedule, which is the one result this pair of columns exists
  // to disprove.
  function toggleEstimate() {
    if (isEstimate) {
      commit(shown, true);
      return;
    }
    commit(localTodayIso(), false);
  }

  if (shown === null) {
    return (
      <span className="relative inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={openPicker}
          disabled={isPending}
          title="Set the date for this milestone. Defaults to today; pick another day for a scheduled date."
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
        {/* Offered before the first date exists so a projection can be entered
            as one. Without it, adding a future estimate would have to be saved
            as a firm date and then demoted, which writes the wrong column and
            leaves a misleading pair of audit entries behind. */}
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-gray-400 select-none",
            isPending && "opacity-60",
          )}
          title="Tick before setting the date to record it as an estimate."
        >
          <input
            type="checkbox"
            checked={draftEstimate}
            disabled={isPending}
            onChange={(e) => setDraftEstimate(e.target.checked)}
            className="h-3 w-3 cursor-pointer accent-amber-600"
          />
          Est.
        </label>
        {hidden}
      </span>
    );
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        title={
          completed
            ? "The date recorded for this completed milestone. Click to change it."
            : isEstimate
              ? "Projected date. Click to change it, or clear the field in the picker to remove it."
              : "Date for this milestone. Click to change it, or clear the field in the picker to fall back to the estimate."
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
          completed
            ? "bg-green-50 text-green-800 hover:bg-green-100"
            : isEstimate
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
        {/* "Completed" and "Est." are not exclusive. An item ticked off whose
            only date is still a projection reads "Completed Est. 7/09", which
            is the honest description of that row rather than a claim the
            milestone landed on the day it was projected to. */}
        {completed && <span className="font-normal opacity-70">Completed</span>}
        {isEstimate && <span className="font-normal opacity-70">Est.</span>}
        {formatDateLabel(shown)}
      </button>

      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-gray-500 select-none",
          isPending && "opacity-60",
        )}
        title={
          isEstimate
            ? "This date is a projection. Untick once it is firm, which stamps today and keeps the projection for slip reporting."
            : "Tick to mark this date as an estimate rather than a firm date."
        }
      >
        <input
          type="checkbox"
          checked={isEstimate}
          disabled={isPending}
          onChange={toggleEstimate}
          className="h-3 w-3 cursor-pointer accent-amber-600"
        />
        Est.
      </label>
      {hidden}
    </span>
  );
}
