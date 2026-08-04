// Verification for the PSA attorney resolver and the Kick off PSA
// composer shaping.
//
// Pure fixtures, no database, so it runs anywhere with no guard and no
// cleanup. The repo has no test runner; this stands in for one on the
// logic most likely to break silently.
//
// Run: npm run verify:psa-resolution

import {
  buildPsaKickoffComposerData,
  describePsaResolution,
  psaAttorneyDisplayName,
  psaDraftingNote,
  resolvePsaAttorney,
  type PsaAttorneyRow,
} from "../lib/psa-attorney";
import type { OrgRow, TeamRow } from "../lib/email/unified-deal-team";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  <- " + detail : ""}`);
}

function atty(over: Partial<PsaAttorneyRow> & { id: string }): PsaAttorneyRow {
  return {
    firmName: "Cox Castle",
    contactName: "Matt Levy",
    contactEmail: "mlevy@coxcastle.example",
    side: "seller",
    ...over,
  };
}

function freeTeamRow(
  id: string,
  team: "owner" | "broker" | "buyer",
  roleLabel: string,
  name: string,
  email: string | null,
): TeamRow {
  return {
    id, team, roleLabel, userId: null, contactId: null, freeName: name, freeEmail: email,
    userName: null, userEmail: null, contactFirst: null, contactLast: null, contactEmail: null,
  };
}

// ---- resolver states -------------------------------------------------
console.log("=== RESOLUTION STATES ===");

const none = resolvePsaAttorney({ rows: [], drafting: null });
check("empty roster, no drafting -> none", none.state === "none", none.state);

const orphan = resolvePsaAttorney({ rows: [], drafting: "seller" });
check("empty roster, drafting set -> orphanedDrafting", orphan.state === "orphanedDrafting", orphan.state);

const naEmpty = resolvePsaAttorney({ rows: [], drafting: "na" });
check("empty roster, drafting 'na' -> none, not orphaned", naEmpty.state === "none", naEmpty.state);

const resolved = resolvePsaAttorney({ rows: [atty({ id: "a" })], drafting: "seller" });
check("one attorney on the drafting side -> resolved", resolved.state === "resolved", resolved.state);
check("  drafter is that attorney", resolved.drafter?.id === "a");

// Regression: this used to collapse into orphanedDrafting, whose copy
// told a user with an attorney plainly on the roster that there was no
// attorney on the roster. Reported from production after flipping the
// drafting side on the Woods deal.
const wrongSide = resolvePsaAttorney({ rows: [atty({ id: "a", side: "seller" })], drafting: "buyer" });
check("attorney on the other side -> sideMismatch, NOT orphanedDrafting", wrongSide.state === "sideMismatch", wrongSide.state);
check("  no drafter named", wrongSide.drafter === null);
check("  the attorney is still sendable", wrongSide.sendable.length === 1);
check(
  "  the chip names the attorney instead of claiming the roster is empty",
  describePsaResolution(wrongSide).includes("Cox Castle") &&
    !/no attorney/i.test(describePsaResolution(wrongSide)),
  describePsaResolution(wrongSide),
);
check(
  "  and says which side they act for",
  describePsaResolution(wrongSide).includes("seller-side"),
  describePsaResolution(wrongSide),
);
check(
  "orphanedDrafting is now reserved for a genuinely empty roster",
  describePsaResolution(orphan).includes("no attorney on the roster"),
  describePsaResolution(orphan),
);

const undecided = resolvePsaAttorney({ rows: [atty({ id: "a" })], drafting: null });
check("attorney but no drafting decision -> undecided", undecided.state === "undecided", undecided.state);
check("  undecided is not an error state", undecided.drafter === null && undecided.sendable.length === 1);

const naDecided = resolvePsaAttorney({ rows: [atty({ id: "a" })], drafting: "na" });
check("drafting 'na' with an attorney -> undecided", naDecided.state === "undecided", naDecided.state);

const ambiguous = resolvePsaAttorney({
  rows: [atty({ id: "a" }), atty({ id: "b", firmName: "Allen Matkins", contactName: "Priya Nandakumar", contactEmail: "pn@allenmatkins.example" })],
  drafting: "seller",
});
check("co-counsel on the drafting side -> ambiguous", ambiguous.state === "ambiguous", ambiguous.state);
check("  no createdAt tiebreak, drafter stays null", ambiguous.drafter === null);
check("  both are still sendable", ambiguous.sendable.length === 2);

// ---- address handling ------------------------------------------------
console.log("\n=== ADDRESS HANDLING ===");

const addrs = resolvePsaAttorney({
  rows: [
    atty({ id: "ok" }),
    atty({ id: "wrapped", contactEmail: "Priya Nandakumar <pn@allenmatkins.example>" }),
    atty({ id: "bracket", contactEmail: "gilad@blackwood.example>" }),
    atty({ id: "junk", contactEmail: "TBD" }),
    atty({ id: "empty", contactEmail: null }),
  ],
  drafting: null,
});
check("repairable addresses are kept", addrs.sendable.length === 3, `got ${addrs.sendable.length}`);
check("missing and invalid are counted separately", addrs.missingEmail === 1 && addrs.invalidEmail === 1,
  `missing=${addrs.missingEmail} invalid=${addrs.invalidEmail}`);
check(
  "no angle bracket survives",
  addrs.sendable.every((s) => !s.email.includes("<") && !s.email.includes(">")),
);
check(
  "wrapped address is unwrapped",
  addrs.sendable.some((s) => s.id === "wrapped" && s.email === "pn@allenmatkins.example"),
);

// ---- display ---------------------------------------------------------
console.log("\n=== DISPLAY ===");
check(
  "orphaned drafting reads neutrally, no warning language",
  !/warn|error|missing|!/i.test(describePsaResolution(orphan)),
  describePsaResolution(orphan),
);
// Real prod data: the Woods deal has firm and contact both recorded as
// "Joseph S. Stuart", a sole practitioner. Rendering that as
// "Joseph S. Stuart, Joseph S. Stuart" would look broken.
check(
  "sole practitioner does not render the name twice",
  psaAttorneyDisplayName(atty({ id: "x", firmName: "Joseph S. Stuart", contactName: "Joseph S. Stuart" })) ===
    "Joseph S. Stuart",
  psaAttorneyDisplayName(atty({ id: "x", firmName: "Joseph S. Stuart", contactName: "Joseph S. Stuart" })),
);
check(
  "firm-only record falls back to the firm",
  psaAttorneyDisplayName(atty({ id: "y", firmName: "Cox Castle", contactName: null })) === "Cox Castle",
);
check(
  "named attorney at a firm renders both",
  psaAttorneyDisplayName(atty({ id: "z" })) === "Matt Levy, Cox Castle",
  psaAttorneyDisplayName(atty({ id: "z" })),
);

// ---- To-line dedupe (CC was deduped, To was not) ---------------------
console.log("\n=== TO DEDUPE ===");
const dupes = resolvePsaAttorney({
  rows: [
    atty({ id: "a", side: "seller" }),
    atty({ id: "b", side: "buyer", contactEmail: "MLevy@CoxCastle.EXAMPLE" }),
  ],
  drafting: null,
});
check("same address on two rows yields one To entry", dupes.sendable.length === 1, `got ${dupes.sendable.length}`);
check("dedupe is case-insensitive", dupes.sendable[0]?.email === "mlevy@coxcastle.example");

// ---- drafting note ---------------------------------------------------
console.log("\n=== DRAFTING NOTE (third person, one message to both sides) ===");
const noteResolved = psaDraftingNote(resolvePsaAttorney({ rows: [atty({ id: "a" })], drafting: "seller" }));
const noteBuyer = psaDraftingNote(
  resolvePsaAttorney({ rows: [atty({ id: "a", side: "buyer" })], drafting: "buyer" }),
);
const noteAmbiguous = psaDraftingNote(ambiguous);
const noteUndecided = psaDraftingNote(undecided);
const noteOrphan = psaDraftingNote(orphan);
for (const [k, v] of Object.entries({ noteResolved, noteBuyer, noteAmbiguous, noteUndecided, noteOrphan })) {
  console.log(`    ${k.padEnd(15)} ${v}`);
}
const allNotes = [noteResolved, noteBuyer, noteAmbiguous, noteUndecided, noteOrphan];
check("no note addresses the reader in the second person", allNotes.every((n) => !/\byour\b|\byou\b/i.test(n)));
check("resolved note names the drafting firm", noteResolved.includes("Cox Castle"));
check("ambiguous note names a side, not a firm", noteAmbiguous.includes("Seller's counsel") && !noteAmbiguous.includes("Cox Castle"));
check("undecided note commits to nothing", noteUndecided.includes("confirm who"));
check("orphaned drafting still states the side", noteOrphan.includes("Seller's counsel"));
check("every note is a complete sentence", allNotes.every((n) => n.endsWith(".")));

// ---- composer shaping ------------------------------------------------
console.log("\n=== COMPOSER SHAPING ===");

const team: TeamRow[] = [
  freeTeamRow("o1", "owner", "Owner", "Matt Hamilton", "matt@hamiltonldi.example"),
  freeTeamRow("b1", "broker", "Lead Broker", "Chris Shiota", "cshiota@landadvisors.com"),
  freeTeamRow("b2", "broker", "Marketing Coordinator", "Loan Nguyen", "lnguyen@landadvisors.com"),
  freeTeamRow("y1", "buyer", "VP Land Acquisition", "Chris Encheff", "cje@taylormorrison.example"),
  freeTeamRow("n1", "owner", "Owner's Counsel", "No Addr", null),
];
const org: OrgRow[] = [
  { id: "u1", name: "Chris Shiota", email: "cshiota@landadvisors.com" },
  { id: "u2", name: "Terry Ruckle", email: "truckle@landadvisors.example" },
];

const built = buildPsaKickoffComposerData({
  psaRows: [atty({ id: "a" }), atty({ id: "b", side: "buyer", firmName: "Allen Matkins", contactName: "Priya Nandakumar", contactEmail: "pn@allenmatkins.example" })],
  drafting: "seller",
  teamRows: team,
  orgRows: org,
});
const defaults = new Set(built.defaultCcIds);

console.log("  TO:");
for (const r of built.to) console.log(`    [${r.capLabel}] ${r.contactName} <${r.contactEmail}> · ${r.roleLabel}`);
console.log("  CC:");
for (const o of built.ccOptions) console.log(`    ${o.group.padEnd(7)} [${o.capLabel}] ${o.name} <${o.email}>${defaults.has(o.id) ? " ✓" : ""}`);

check("both sides' attorneys are on To", built.to.length === 2);
check("the drafter's chip says so", built.to.some((r) => r.roleLabel === "PSA Attorney · drafting"));
check("the non-drafter's chip does not", built.to.some((r) => r.roleLabel === "PSA Attorney"));
check("ownership is CC'd by default", built.ccOptions.some((o) => defaults.has(o.id) && o.group === "owner"));
check("the brokerage is CC'd by default", built.ccOptions.filter((o) => defaults.has(o.id) && o.group === "broker").length === 2);
check(
  "the buyer team is offered but NOT pre-checked",
  built.ccOptions.some((o) => o.group === "buyer") &&
    !built.ccOptions.some((o) => defaults.has(o.id) && o.group === "buyer"),
);
check(
  "no CC address duplicates a To address",
  built.ccOptions.every((o) => !built.to.some((r) => r.contactEmail.toLowerCase() === o.email.toLowerCase())),
);
check(
  "no two CC options share an address (org member already on the broker team is dropped)",
  (() => {
    const withAddr = built.ccOptions.filter((o) => o.email).map((o) => o.email.toLowerCase());
    return new Set(withAddr).size === withAddr.length;
  })(),
);
check("composer carries a drafting note", built.draftingNote.length > 0 && built.draftingNote.endsWith("."));
check(
  "addressless team member is surfaced disabled, not silently dropped",
  built.ccOptions.some((o) => o.name === "No Addr" && o.disabled && o.disabledNote === "no email on file"),
);
check(
  "a disabled option is never a default CC",
  built.ccOptions.filter((o) => defaults.has(o.id)).every((o) => !o.disabled),
);
check("every default id exists in the options", built.defaultCcIds.every((id) => built.ccOptions.some((o) => o.id === id)));
check("no duplicate default ids", new Set(built.defaultCcIds).size === built.defaultCcIds.length);
check("team CC ids are sentinel-prefixed, org ids are bare", built.ccOptions.every((o) => (o.group === "org" ? !o.id.includes(":") : o.id.includes(":"))));

// The dedupe trap: a PSA attorney who is ALSO on the deal team must not
// end up on both lines of the same message.
const overlap = buildPsaKickoffComposerData({
  psaRows: [atty({ id: "a", contactEmail: "matt@hamiltonldi.example" })],
  drafting: "seller",
  teamRows: team,
  orgRows: org,
});
check(
  "an attorney who is also on the deal team is not double-listed",
  overlap.ccOptions.every((o) => o.email.toLowerCase() !== "matt@hamiltonldi.example"),
);

// No attorney at all: the button must be able to reject before opening.
const empty = buildPsaKickoffComposerData({ psaRows: [], drafting: "seller", teamRows: team, orgRows: org });
check("no attorney -> empty To, so the send is refused at click time", empty.to.length === 0);

console.log("");
console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
