// People CC'd by default on Deal Team sends.
//
// Chris asked for the marketing coordinator to be copied as standard on
// the "Send to Deal Team" flows so she has visibility without him
// remembering to add her each time. The CC is a DEFAULT, not a lock —
// it's pre-checked in the composer's CC picker and the sender can
// uncheck it for any individual send.
//
// Matched by email rather than a hardcoded user id so the same rule
// works across local / preview / production, where the users table has
// different uuids. A miss is silent by design: if nobody in the org
// directory has this address (fresh local DB, person offboarded), the
// send proceeds with no default CC rather than erroring.
//
// Deliberately NOT a database setting. There's exactly one entry and it
// changes roughly never; a per-org admin UI for it would be more
// surface area than the rule deserves. Revisit if this list grows or if
// it needs to differ per deal.
export const DEFAULT_DEAL_TEAM_CC_EMAILS: readonly string[] = [
  "lnguyen@landadvisors.com",
];

// Resolve the default-CC emails against the org's user directory.
// Returns the matching user ids; unmatched addresses are dropped.
export function resolveDefaultCcUserIds(
  options: ReadonlyArray<{ id: string; email: string }>,
): string[] {
  const wanted = new Set(
    DEFAULT_DEAL_TEAM_CC_EMAILS.map((e) => e.trim().toLowerCase()),
  );
  return options
    .filter((o) => wanted.has(o.email.trim().toLowerCase()))
    .map((o) => o.id);
}
