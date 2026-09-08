// Pure decision logic for the milestone date control.
//
// Kept in its own module with no imports so it can be exercised directly. The
// component next to it imports the server actions, which drag in the email
// stack and cannot be loaded outside the Next bundler, so anything testable
// has to live away from it.
//
// This exists because the first version shipped with the branches inverted:
// ticking Est. on a firm date ran the promote path, stamping today and leaving
// the box unticked. Driving the server action with an explicit flag did not
// catch it, because the defect was in deciding the flag.

export type DateToggleResult = {
  date: string | null;
  isEstimate: boolean;
};

// What clicking the "Est." checkbox should write.
//
//   ticking (currently firm)     -> keep the date, mark it a projection
//   unticking (currently an est) -> stamp TODAY, mark it firm
//
// Unticking deliberately does not carry the projection across. A projection
// accepted unchanged as the actual would record every milestone as landing
// exactly on schedule, which is the one result these two columns exist to
// disprove.
export function estimateToggleArgs(args: {
  shown: string | null;
  isEstimate: boolean;
  today: string;
}): DateToggleResult {
  if (args.isEstimate) return { date: args.today, isEstimate: false };
  return { date: args.shown, isEstimate: true };
}

// Which of the two columns the row is currently showing. The displayed date is
// `tracked_date ?? estimated_date`, and the box reads ticked only when the
// value can be coming from the estimate column.
export function deriveDateState(value: string | null, estimate: string | null): {
  shown: string | null;
  isEstimate: boolean;
} {
  return {
    shown: value ?? estimate,
    isEstimate: value === null && estimate !== null,
  };
}
