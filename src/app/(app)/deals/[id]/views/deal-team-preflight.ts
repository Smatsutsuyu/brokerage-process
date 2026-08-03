// Shared pre-flight for the Deal Team send buttons.
//
// Extracted from deal-team-send-button.tsx when the unified (single
// email, To/CC split) variant landed — both buttons gate on the same
// template placeholders and must reject with identical copy, so the
// resolver and the rejection strings live here rather than being
// duplicated per button.
//
// Why gate at all instead of opening with the raw placeholder:
// interpolate() deliberately passes unmatched {{vars}} through verbatim
// so they're visible in the preview. That's right for a typo, but for a
// var we KNOW has a data source it just means the user ships
// "{{ddFolderUrl}}" to the client or hand-pastes it every send.

import { formatMilestoneDate } from "@/lib/format-milestone-date";

import { getDdFolderUrl, getOfferingDate, getSooReviewDate } from "../actions";

// Template placeholders a Deal Team button can resolve server-side
// before the composer opens. Callers opt in via `requireVars` — anything
// listed there is a hard gate: no value, no composer.
export type RequirableVar = "ddFolderUrl" | "offersDueDate" | "reviewDate";

export const MISSING_COPY: Record<RequirableVar, string> = {
  ddFolderUrl:
    "No DD folder link found. Add one to this row (or to the Phase 1 Create Full Due Diligence Dropbox Folder row), then send.",
  offersDueDate:
    "Set the Offering Date on the Phase 2 row first, then send. The invite body uses it.",
  reviewDate:
    "Set the review date on this row first, then send. The invite body uses it.",
};

// Resolve one required var to its final, substitution-ready value (or
// null when unset). Date vars are formatted here, not at the call site:
// tracked_date comes back as a raw "YYYY-MM-DD" (or a Date,
// driver-dependent), and dropping that straight into a body would ship
// "offers due on 2026-08-14" while every sibling template renders
// "Friday, August 14, 2026".
export async function resolveRequirableVar(
  name: RequirableVar,
  input: { dealId: string; sourceItemId?: string | null },
): Promise<string | null> {
  const { dealId, sourceItemId } = input;
  switch (name) {
    case "ddFolderUrl":
      return getDdFolderUrl({ dealId, itemId: sourceItemId ?? null });
    case "offersDueDate": {
      const raw = await getOfferingDate({ dealId });
      return raw ? formatMilestoneDate(raw) : null;
    }
    case "reviewDate": {
      const raw = await getSooReviewDate({ dealId, itemId: sourceItemId ?? null });
      return raw ? formatMilestoneDate(raw) : null;
    }
  }
}

// Outcome of a pre-flight pass. `ok: false` carries either the copy for
// an inline rejection bubble (a data-state problem the user can fix) or
// a transport flag (auth/network — surfaced via toast instead).
export type PreflightResult =
  | { ok: true; resolved: Record<string, string> }
  | { ok: false; kind: "missing"; message: string }
  | { ok: false; kind: "failed" };

// Resolve every required var before touching the composer. Resolved in
// parallel, but the miss reported is the FIRST one in `required` order —
// callers list row-local requirements first so the user is pointed at
// the field next to the button before being sent to another phase.
export async function runPreflight(input: {
  dealId: string;
  sourceItemId?: string | null;
  required: RequirableVar[];
}): Promise<PreflightResult> {
  const { dealId, sourceItemId, required } = input;
  if (required.length === 0) return { ok: true, resolved: {} };

  let values: (string | null)[];
  try {
    values = await Promise.all(
      required.map((name) => resolveRequirableVar(name, { dealId, sourceItemId })),
    );
  } catch (err) {
    // A throw here is an auth/transport failure, not a data-state
    // problem — the resolvers throw on missing org context and return
    // null for genuinely-unset values.
    console.error("[deal-team-send] pre-flight failed", err);
    return { ok: false, kind: "failed" };
  }

  const missIdx = values.findIndex((v) => !v);
  if (missIdx !== -1) {
    return { ok: false, kind: "missing", message: MISSING_COPY[required[missIdx]] };
  }

  const resolved: Record<string, string> = {};
  required.forEach((name, i) => {
    resolved[name] = values[i] as string;
  });
  return { ok: true, resolved };
}
