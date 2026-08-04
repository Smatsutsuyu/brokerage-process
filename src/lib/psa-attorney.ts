// Resolving "the PSA attorney for this deal" from the consultant roster.
//
// There is deliberately no deal-level pointer. The attorney is derived at
// read time from the deal's consultants with role = "psa_attorney",
// intersected with deals.psa_drafting when a single drafter is needed.
//
// Two axes, kept strictly separate:
//   consultants.side  — whom the firm represents (buyer or seller)
//   deals.psa_drafting — whose counsel holds the pen (buyer, seller, na)
//
// The resolver is allowed to answer "I don't know", in two distinct ways,
// and every consumer degrades cleanly when it does. There is no
// createdAt tiebreak: co-counsel on the drafting side is a real thing,
// and silently picking the older row would be a lie.
//
// Pure on purpose. actions.ts carries "use server" and may only export
// async functions, so logic living there cannot be exercised by a
// script. See src/scripts/verify-psa-resolution.ts.

import { parseEmailAddress } from "@/lib/email-address";
import { DEFAULT_DEAL_TEAM_CC_EMAILS } from "@/lib/email/default-cc";
import {
  resolveTeamIdentity,
  type OrgRow,
  type TeamRow,
  type UnifiedCapLabel,
  type UnifiedCcGroup,
  type UnifiedCcOption,
} from "@/lib/email/unified-deal-team";

export type PsaSide = "buyer" | "seller";
export type PsaDraftingValue = "buyer" | "seller" | "na";

// One consultant row with role = "psa_attorney".
export type PsaAttorneyRow = {
  id: string;
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  side: PsaSide;
};

// A row that can actually be emailed. `email` is the parsed, repaired
// address, never the raw column value.
export type SendablePsaAttorney = PsaAttorneyRow & { email: string };

export type PsaResolutionState =
  // No psa_attorney consultant on the deal at all.
  | "none"
  // Exactly one attorney on the drafting side. `drafter` is set.
  | "resolved"
  // Attorneys exist, but drafting is null or "na", so no single drafter
  // can be named. Not an error: nothing has been decided yet.
  | "undecided"
  // Drafting says a side and the roster is EMPTY. Normal for most of a
  // deal's life. Must NOT be rendered as a warning.
  | "orphanedDrafting"
  // Drafting says a side, attorneys exist, but none of them are on that
  // side. Distinct from orphanedDrafting on purpose: the two used to be
  // one state, and the shared copy told a user with an attorney plainly
  // on the roster that there was no attorney on the roster. Flipping the
  // drafting side is the normal way to reach this, and the attorney is
  // still there and still perfectly sendable.
  | "sideMismatch"
  // Two or more attorneys on the drafting side. Genuine co-counsel.
  | "ambiguous";

export type PsaResolution = {
  // Every psa_attorney consultant on the deal, both sides.
  rows: PsaAttorneyRow[];
  // Those with an address that survives parsing, deduplicated by
  // address. This is the To line.
  sendable: SendablePsaAttorney[];
  // Rows with no address at all on file.
  missingEmail: number;
  // Rows whose address is present but could not be parsed. Kept separate
  // from missingEmail because the two need different copy: one says "add
  // an address", the other says "fix the one that's there".
  invalidEmail: number;
  // The single attorney on the drafting side, when there is exactly one.
  // Cosmetic only: used for a badge and the drafting note, never to
  // decide who receives the email.
  drafter: PsaAttorneyRow | null;
  state: PsaResolutionState;
  // Carried so consumers never have to pass drafting alongside the
  // resolution and risk the two desyncing.
  drafting: PsaDraftingValue | null;
};

// Display name for a row. firmName is NOT NULL so there is always
// something; contactName is the better label when present.
export function psaAttorneyDisplayName(r: PsaAttorneyRow): string {
  const contact = r.contactName?.trim();
  if (contact && contact !== r.firmName.trim()) return `${contact}, ${r.firmName}`;
  return contact || r.firmName;
}

export function resolvePsaAttorney(input: {
  rows: PsaAttorneyRow[];
  drafting: PsaDraftingValue | null;
}): PsaResolution {
  const { rows, drafting } = input;

  // Parse rather than trust. updateConsultant only started validating
  // addresses on 2026-08-03, so older rows can hold "Name <addr>" or
  // free text. One malformed address fails the whole outbound message
  // at Resend.
  //
  // Deduplicated by address on the way in: the same firm recorded once
  // per side, or a duplicate data entry, would otherwise put the same
  // person on the To line twice. The CC pool downstream is deduped, so
  // leaving To unguarded would be the one asymmetric gap.
  const sendable: SendablePsaAttorney[] = [];
  const seen = new Set<string>();
  let missingEmail = 0;
  let invalidEmail = 0;
  for (const r of rows) {
    if (!r.contactEmail?.trim()) {
      missingEmail += 1;
      continue;
    }
    let email: string | null = null;
    try {
      email = parseEmailAddress(r.contactEmail);
    } catch {
      email = null;
    }
    if (!email) {
      invalidEmail += 1;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sendable.push({ ...r, email });
  }

  const base = { rows, sendable, missingEmail, invalidEmail, drafting };

  if (rows.length === 0) {
    return {
      ...base,
      drafter: null,
      state: drafting && drafting !== "na" ? "orphanedDrafting" : "none",
    };
  }

  // Nothing decided yet, or explicitly "not applicable". No drafter, and
  // nothing is wrong.
  if (!drafting || drafting === "na") {
    return { ...base, drafter: null, state: "undecided" };
  }

  const onDraftingSide = rows.filter((r) => r.side === drafting);
  if (onDraftingSide.length === 1) {
    return { ...base, drafter: onDraftingSide[0], state: "resolved" };
  }
  if (onDraftingSide.length === 0) {
    // rows is non-empty here (the empty case returned above), so the
    // attorneys exist and simply act for the other side.
    return { ...base, drafter: null, state: "sideMismatch" };
  }
  return { ...base, drafter: null, state: "ambiguous" };
}

function sideWord(side: PsaSide): string {
  return side === "buyer" ? "buyer-side" : "seller-side";
}

// The sentence stating who prepares the first draft, in the third
// person, for the {{draftingNote}} template var.
//
// Third person because the To line carries both sides' counsel in a
// single message: "your office is preparing the first draft" would be
// addressed to one recipient and wrong for the other. It degrades to
// side-neutral wording whenever the roster cannot name a single drafter,
// which is the normal state of a deal for most of its life.
export function psaDraftingNote(res: PsaResolution): string {
  if (res.state === "resolved" && res.drafter) {
    return res.drafting === "buyer"
      ? `Our understanding is that ${psaAttorneyDisplayName(res.drafter)} is preparing the first draft.`
      : `We have asked ${psaAttorneyDisplayName(res.drafter)} to prepare the first draft.`;
  }
  // Drafting side is known but the roster cannot pin it to one firm, so
  // name the side rather than a firm.
  if (res.drafting === "buyer") {
    return "Our understanding is that buyer's counsel is preparing the first draft.";
  }
  if (res.drafting === "seller") {
    return "Seller's counsel will prepare the first draft.";
  }
  return "We will confirm who is preparing the first draft shortly.";
}

// Short human summary of a resolution, for the Phase 1 chip and the
// composer description. Deliberately neutral for every state: an empty
// roster during go-to-market is the normal condition of a deal, not an
// error, and painting the standard state as a warning trains the user to
// ignore warnings.
export function describePsaResolution(res: PsaResolution): string {
  // "Buyer" / "Seller" only ever renders in states that require a
  // non-null, non-"na" drafting value, so the fallback is unreachable in
  // practice and exists to keep the expression total.
  const side = res.drafting === "buyer" ? "Buyer" : "Seller";
  switch (res.state) {
    case "resolved":
      return `${psaAttorneyDisplayName(res.drafter!)} · ${side} drafting`;
    case "ambiguous":
      return `${res.rows.filter((r) => r.side === res.drafting).length} attorneys · ${side} drafting`;
    // Attorneys exist, just not on the drafting side. Name them and say
    // which side they act for. Never claim the roster is empty: it isn't,
    // and saying so sent a user looking for a record that was in front of
    // them.
    case "sideMismatch":
      return res.rows.length === 1
        ? `${psaAttorneyDisplayName(res.rows[0])} (${sideWord(res.rows[0].side)}) · ${side} drafting`
        : `${res.rows.length} attorneys, none ${side.toLowerCase()}-side · ${side} drafting`;
    // Reached only when drafting is set, is not "na", and the roster is
    // genuinely empty.
    case "orphanedDrafting":
      return `${side} drafting · no attorney on the roster yet`;
    case "undecided":
      return res.rows.length === 1
        ? psaAttorneyDisplayName(res.rows[0])
        : `${res.rows.length} attorneys on the roster`;
    case "none":
      return "Not set";
  }
}

// ---------------------------------------------------------------------
// Composer shaping for the Kick off PSA send
// ---------------------------------------------------------------------

export type PsaKickoffRecipient = {
  contactId: string;
  contactName: string;
  contactEmail: string;
  capLabel: UnifiedCapLabel;
  roleLabel: string;
};

export type PsaKickoffComposerData = {
  to: PsaKickoffRecipient[];
  ccOptions: UnifiedCcOption[];
  defaultCcIds: string[];
  // psa_attorney rows with no address on file, and rows whose address is
  // present but unparseable. Separate because the rejection copy differs:
  // one says add an address, the other says fix the one that is there.
  missingEmail: number;
  invalidEmail: number;
  // The third-person sentence naming who prepares the first draft, fed
  // straight into the {{draftingNote}} template var.
  draftingNote: string;
  drafting: PsaDraftingValue | null;
  resolutionState: PsaResolutionState;
};

const TEAM_CAP: Record<"owner" | "broker" | "buyer", UnifiedCapLabel> = {
  owner: "Owner",
  broker: "Broker",
  buyer: "Buyer",
};

const TEAM_GROUP: Record<"owner" | "broker" | "buyer", UnifiedCcGroup> = {
  owner: "owner",
  broker: "broker",
  buyer: "buyer",
};

function norm(e: string): string {
  return e.trim().toLowerCase();
}

// Builds the Kick off PSA composer shape.
//
// To: every psa_attorney consultant with a parseable address, both
// sides, always. A kickoff that reaches only one side's counsel is a
// mistake, not a feature, and addressing `sendable` rather than
// `drafter` is what lets the send work on a deal where nobody has
// decided who drafts yet.
//
// CC: our side of the table pre-checked (ownership, the brokerage, the
// marketing coordinator). The Buyer Team is offered but never
// pre-checked: on a seller-drafts PSA the buyer hears it from their own
// counsel, and copying them is a judgement call.
//
// NOTE the dedupe. claimedEmails is seeded from THIS send's To line, not
// from the Deal Team's. buildUnifiedComposerData seeds its own set from
// the deal team recipients, so reusing its ccOptions here unmodified
// would let the same person land on both To and CC of one message.
export function buildPsaKickoffComposerData(input: {
  psaRows: PsaAttorneyRow[];
  drafting: PsaDraftingValue | null;
  teamRows: TeamRow[];
  orgRows: OrgRow[];
}): PsaKickoffComposerData {
  const { psaRows, drafting, teamRows, orgRows } = input;
  const res = resolvePsaAttorney({ rows: psaRows, drafting });

  const to: PsaKickoffRecipient[] = res.sendable.map((r) => ({
    contactId: r.id,
    contactName: psaAttorneyDisplayName(r),
    contactEmail: r.email,
    capLabel: r.side === "buyer" ? "Buyer" : "Seller",
    roleLabel:
      res.drafter && res.drafter.id === r.id ? "PSA Attorney · drafting" : "PSA Attorney",
  }));

  const ccOptions: UnifiedCcOption[] = [];
  const defaultCcIds: string[] = [];
  const claimed = new Set<string>(to.map((r) => norm(r.contactEmail)));

  for (const row of teamRows) {
    const team = row.team;
    if (team !== "owner" && team !== "broker" && team !== "buyer") continue;
    const { name, email } = resolveTeamIdentity(row);
    if (!email?.trim()) {
      // Surfaced disabled rather than dropped, matching the unified Deal
      // Team composer. A silently partial CC contradicts a description
      // that says ownership and the brokerage are copied.
      ccOptions.push({
        id: `${team}:${row.id}`,
        name,
        email: "",
        capLabel: TEAM_CAP[team],
        roleLabel: row.roleLabel?.trim() || null,
        group: TEAM_GROUP[team],
        disabled: true,
        disabledNote: "no email on file",
      });
      continue;
    }
    if (claimed.has(norm(email))) continue;
    const id = `${team}:${row.id}`;
    ccOptions.push({
      id,
      name,
      email: email.trim(),
      capLabel: TEAM_CAP[team],
      roleLabel: row.roleLabel?.trim() || null,
      group: TEAM_GROUP[team],
    });
    claimed.add(norm(email));
    // Our side rides along by default; the buyer's people do not.
    if (team === "owner" || team === "broker") defaultCcIds.push(id);
  }

  const defaultEmails = new Set(DEFAULT_DEAL_TEAM_CC_EMAILS.map(norm));
  for (const u of orgRows) {
    if (claimed.has(norm(u.email))) continue;
    ccOptions.push({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      capLabel: "Org",
      roleLabel: null,
      group: "org",
    });
    claimed.add(norm(u.email));
    if (defaultEmails.has(norm(u.email))) defaultCcIds.push(u.id);
  }

  return {
    to,
    ccOptions,
    defaultCcIds,
    missingEmail: res.missingEmail,
    invalidEmail: res.invalidEmail,
    draftingNote: psaDraftingNote(res),
    drafting,
    resolutionState: res.state,
  };
}
