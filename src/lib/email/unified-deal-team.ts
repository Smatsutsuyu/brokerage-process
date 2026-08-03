// Pure shaping logic for the unified Deal Team composer.
//
// Lives here rather than inside the server action because actions.ts
// carries "use server" and may only export async functions — which
// makes anything in it untestable by construction. The action does the
// three queries and hands the raw rows to buildUnifiedComposerData();
// src/scripts/_verify-unified.ts feeds the SAME function real rows, so
// the thing under test is the thing that ships.

import { ROLE_LABEL as CONSULTANT_ROLE_LABEL } from "@/lib/consultant-roles";
import { parseEmailAddress } from "@/lib/email-address";
import { DEFAULT_DEAL_TEAM_CC_EMAILS } from "@/lib/email/default-cc";

export type DealTeamKey = "owner" | "broker" | "buyer";

// `capLabel` is the short provenance token shown at the leading edge of
// each To/CC chip. Every value is a string the app already renders
// somewhere else, so the composer quotes existing vocabulary instead of
// coining synonyms:
//   Owner / Broker / Buyer  — the deal team sub-team labels
//   Seller / Buyer          — the consultant side badge on the
//                             Consultants tab (SIDE_META)
//   Org                     — the CC picker's "Org Members" section
//
// Note the deliberate overlap: a Buyer Team principal and a buyer-side
// consultant both read "Buyer", because both genuinely sit on the
// buyer's side. `roleLabel` is what separates them and always renders
// for both.
export type UnifiedCapLabel = "Owner" | "Broker" | "Buyer" | "Seller" | "Org";

// Picker section keys. Mirrors CcGroup in components/email/cc-picker.tsx.
export type UnifiedCcGroup =
  | "broker"
  | "org"
  | "consultant_seller"
  | "consultant_buyer";

export type UnifiedRecipient = {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  capLabel: UnifiedCapLabel;
  roleLabel: string | null;
};

export type UnifiedCcOption = {
  id: string;
  name: string;
  email: string;
  capLabel: UnifiedCapLabel;
  roleLabel: string | null;
  group: UnifiedCcGroup;
  // Rendered greyed-out and unselectable in the picker. Used for
  // consultants with no email on file: they surface nowhere else in this
  // flow, so silently omitting them reads as a bug, while a disabled row
  // routes the user to the Consultants tab to fix the record.
  disabled?: boolean;
  disabledNote?: string;
};

export type UnifiedDealTeamComposerData = {
  to: UnifiedRecipient[];
  ccOptions: UnifiedCcOption[];
  defaultCcIds: string[];
  // Deal-team members on the To side that were dropped for want of an
  // email address. Surfaced in the composer so an under-send is visible
  // rather than silent.
  toWithoutEmail: number;
  // True when neither ownership nor the buyer had an addressable member
  // and the brokerage is carrying the send instead. The composer says so
  // in its description, since "To: the brokerage" is not what the button
  // otherwise promises.
  brokerIsRecipient: boolean;
};

// Raw row shapes, mirroring the action's select lists.
export type TeamRow = {
  id: string;
  team: DealTeamKey;
  roleLabel: string | null;
  userId: string | null;
  contactId: string | null;
  freeName: string | null;
  freeEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  contactFirst: string | null;
  contactLast: string | null;
  contactEmail: string | null;
};

export type ConsultantRow = {
  id: string;
  role: string;
  side: "buyer" | "seller";
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
};

export type OrgRow = { id: string; name: string | null; email: string };

const UNIFIED_TO_TEAMS: DealTeamKey[] = ["owner", "buyer"];

const UNIFIED_TEAM_CAP: Record<DealTeamKey, UnifiedCapLabel> = {
  owner: "Owner",
  broker: "Broker",
  buyer: "Buyer",
};

// Resolve a deal_team_members row to its display name + email using the
// same three-source priority as listDealTeam (user FK, contact FK, then
// free text). Kept local rather than reusing resolveDealTeamMemberName
// because we need the email alongside the name.
function resolveTeamIdentity(r: TeamRow): { name: string; email: string | null } {
  if (r.userId && (r.userName || r.userEmail)) {
    return { name: r.userName || r.userEmail!, email: r.userEmail };
  }
  if (r.contactId && (r.contactFirst || r.contactLast)) {
    return {
      name: `${r.contactFirst ?? ""} ${r.contactLast ?? ""}`.trim(),
      email: r.contactEmail,
    };
  }
  if (r.freeName) return { name: r.freeName, email: r.freeEmail };
  return { name: "(unknown)", email: null };
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function buildUnifiedComposerData(input: {
  teamRows: TeamRow[];
  consultantRows: ConsultantRow[];
  orgRows: OrgRow[];
}): UnifiedDealTeamComposerData {
  const { teamRows, consultantRows, orgRows } = input;

  // Resolve identity once, then bucket. Ownership + buyer normally carry
  // the send with the brokerage on CC.
  type Resolved = { row: TeamRow; name: string; email: string | null };
  const ownerBuyer: Resolved[] = [];
  const brokers: Resolved[] = [];
  for (const row of teamRows) {
    const { name, email } = resolveTeamIdentity(row);
    const entry: Resolved = { row, name, email: email?.trim() ? email.trim() : null };
    if (UNIFIED_TO_TEAMS.includes(row.team)) ownerBuyer.push(entry);
    else if (row.team === "broker") brokers.push(entry);
  }

  // Fallback: when neither ownership nor the buyer yields an addressable
  // member, the brokerage carries the send rather than the row becoming
  // unsendable. The per-sub-team button this replaced would email the
  // Broker Team on its own (teams={["owner","broker","buyer"]}), and a
  // deal whose roster is still broker-only is a real state — the dev
  // seed is exactly that. Without this, swapping a row to the unified
  // button would silently remove its ability to send.
  const brokerIsRecipient = !ownerBuyer.some((e) => e.email);
  const primary = brokerIsRecipient ? brokers : ownerBuyer;

  // --- To line ---------------------------------------------------------
  const to: UnifiedRecipient[] = [];
  let toWithoutEmail = 0;
  for (const e of primary) {
    if (!e.email) {
      toWithoutEmail += 1;
      continue;
    }
    to.push({
      contactId: e.row.id,
      contactName: e.name,
      contactEmail: e.email,
      capLabel: UNIFIED_TEAM_CAP[e.row.team],
      roleLabel: e.row.roleLabel?.trim() || null,
    });
  }

  // --- CC pool: brokerage, consultants, org ---------------------------
  const ccOptions: UnifiedCcOption[] = [];
  const brokerDefaultIds: string[] = [];
  // Emails already reachable via a more specific entry, so nobody is
  // offered twice under a vaguer cap. Seeded with the To line so nobody
  // is offered as a CC of themselves.
  const claimedEmails = new Set<string>();
  for (const r of to) {
    if (r.contactEmail) claimedEmails.add(normalizeEmail(r.contactEmail));
  }

  // Skipped entirely when the brokerage is already the To line.
  if (!brokerIsRecipient) {
    for (const e of brokers) {
      if (!e.email) {
        // Surfaced rather than dropped, matching how an address-less
        // consultant is handled below and how toWithoutEmail handles the
        // To line. A silently partial brokerage contradicts the
        // composer's "the brokerage is CC'd" promise.
        ccOptions.push({
          id: `broker:${e.row.id}`,
          name: e.name,
          email: "",
          capLabel: "Broker",
          roleLabel: e.row.roleLabel?.trim() || null,
          group: "broker",
          disabled: true,
          disabledNote: "no email on file",
        });
        continue;
      }
      // Duplicate guard: the same person can hold two broker rows on a
      // deal. Offering them twice would also double-CC them.
      if (claimedEmails.has(normalizeEmail(e.email))) continue;
      // Sentinel-prefixed id: not a users.id, so it must never reach a
      // uuid[] column. Consumers persist by allowlist, not by prefix.
      const id = `broker:${e.row.id}`;
      ccOptions.push({
        id,
        name: e.name,
        email: e.email,
        capLabel: "Broker",
        roleLabel: e.row.roleLabel?.trim() || null,
        group: "broker",
      });
      brokerDefaultIds.push(id);
      claimedEmails.add(normalizeEmail(e.email));
    }
  }

  for (const c of consultantRows) {
    const name = c.contactName?.trim() || c.firmName;
    const roleLabel =
      CONSULTANT_ROLE_LABEL[c.role as keyof typeof CONSULTANT_ROLE_LABEL] ?? c.role;
    const capLabel: UnifiedCapLabel = c.side === "buyer" ? "Buyer" : "Seller";
    const group: UnifiedCcGroup =
      c.side === "buyer" ? "consultant_buyer" : "consultant_seller";
    // Parse rather than trust. This is the first path that turns a
    // consultant record into an email recipient, and updateConsultant
    // historically stored the raw string, so rows can hold
    // "Jane <jane@x.com>" or "TBD". One malformed address fails the whole
    // outbound message at Resend — that is exactly the 422 that bit us on
    // a buyer contact. An unparseable address lands in the same disabled
    // branch as a missing one, with copy that says which it is.
    let email: string | null = null;
    let badAddress = false;
    try {
      email = parseEmailAddress(c.contactEmail);
    } catch {
      email = null;
      badAddress = true;
    }
    if (!email) {
      ccOptions.push({
        id: `consultant:${c.id}`,
        name,
        email: "",
        capLabel,
        roleLabel,
        group,
        disabled: true,
        disabledNote: badAddress ? "invalid email on file" : "no email on file",
      });
      continue;
    }
    // A consultant who is also a To recipient or a broker is already
    // covered; don't offer a second, differently-capped entry for the
    // same address.
    if (claimedEmails.has(normalizeEmail(email))) continue;
    ccOptions.push({
      id: `consultant:${c.id}`,
      name,
      email,
      capLabel,
      roleLabel,
      group,
    });
    claimedEmails.add(normalizeEmail(email));
  }

  for (const u of orgRows) {
    if (claimedEmails.has(normalizeEmail(u.email))) continue;
    ccOptions.push({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      capLabel: "Org",
      roleLabel: null,
      group: "org",
    });
    claimedEmails.add(normalizeEmail(u.email));
  }

  // --- Default CC -----------------------------------------------------
  // The brokerage rides along by default (Chris: "CC to Loan and
  // co-brokers"), plus the marketing coordinator wherever she surfaces.
  // Matched on email rather than id so it works across environments; a
  // miss is silent by design.
  const defaultEmails = new Set(DEFAULT_DEAL_TEAM_CC_EMAILS.map(normalizeEmail));
  const defaultCcIds = [
    ...brokerDefaultIds,
    ...ccOptions
      .filter(
        (o) =>
          !o.disabled &&
          o.group !== "broker" &&
          o.email &&
          defaultEmails.has(normalizeEmail(o.email)),
      )
      .map((o) => o.id),
  ];

  return { to, ccOptions, defaultCcIds, toWithoutEmail, brokerIsRecipient };
}
