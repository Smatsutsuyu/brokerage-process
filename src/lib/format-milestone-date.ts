// Canonical human formatting for checklist milestone dates that get
// substituted into client-facing email bodies ({{dueDate}},
// {{bnfDueDate}}, {{offersDueDate}}, {{reviewDate}}).
//
// Lives here rather than in actions.ts because a "use server" module can
// only export async functions — a pure formatter can't be shared from
// there, which is how the SOO invite ended up shipping raw ISO dates
// while every sibling template rendered "Friday, June 12, 2026".
//
// Parses YYYY-MM-DD against a LOCAL-time Date on purpose: passing the
// string to new Date() treats it as UTC midnight, which rolls back a day
// in negative-offset zones (the whole US). Also tolerates a Date
// instance, since Postgres date columns surface as either a string or a
// Date depending on which driver is active (neon-http vs postgres-js).
//
// Returns "" for null/unparseable input. Callers that substitute into a
// template must treat "" as missing — interpolate() re-emits the literal
// {{placeholder}} for an empty string, so an unguarded "" ships a raw
// placeholder to the client.
export function formatMilestoneDate(value: string | Date | null | undefined): string {
  if (!value) return "";

  const date =
    value instanceof Date
      ? value
      : (() => {
          const [y, m, d] = value.split("-").map(Number);
          if (!y || !m || !d) return null;
          return new Date(y, m - 1, d);
        })();

  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
