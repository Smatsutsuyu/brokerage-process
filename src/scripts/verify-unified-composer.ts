// Verification harness for the unified Deal Team composer.
//
// The repo has no test runner, so this stands in for one on the piece of
// this feature most likely to break silently: the recipient/CC shaping.
// It inserts a realistic fixture set on a local deal, runs the SAME
// three queries the server action runs, feeds them the SAME pure
// transform the action uses (buildUnifiedComposerData), asserts across
// four scenarios, then removes the fixtures.
//
// Run: npm run verify:unified-composer
//
// LOCAL ONLY. It writes and deletes deal_team_members / consultants
// rows, so it refuses to run against anything but a localhost database.

import { and, asc, eq, like } from "drizzle-orm";

import { db } from "../db";
import {
  authUser,
  consultants,
  contacts,
  dealTeamMembers,
  deals,
  users,
} from "../db/schema";
import { buildUnifiedComposerData, type TeamRow } from "../lib/email/unified-deal-team";

const TAG = "[verify-unified fixture]";

// Hard stop before any write. This script mutates deal_team_members and
// consultants; pointing it at Neon would insert fixtures onto a real
// deal and then delete rows by a notes LIKE match.
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  if (!isLocal) {
    throw new Error(
      "verify-unified-composer writes fixture rows and must only run against a local database. " +
        "DATABASE_URL does not look like localhost — refusing to run.",
    );
  }
}

async function main() {
  assertLocalDatabase();
  const [deal] = await db
    .select({ id: deals.id, orgId: deals.orgId, name: deals.name })
    .from(deals)
    .orderBy(asc(deals.createdAt))
    .limit(1);
  if (!deal) throw new Error("no deals in local db");
  console.log(`deal: ${deal.name} (${deal.id})\n`);

  const orgUsers = await db
    .select({ id: users.id, name: authUser.name, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(users.orgId, deal.orgId))
    .orderBy(asc(authUser.name));
  console.log("org users:", orgUsers.map((u) => `${u.name} <${u.email}>`).join(", ") || "(none)");

  const someContacts = await db
    .select({ id: contacts.id, first: contacts.firstName, last: contacts.lastName, email: contacts.email })
    .from(contacts)
    .limit(4);
  const withEmail = someContacts.filter((c) => c.email);
  console.log("contacts w/ email:", withEmail.length, "\n");

  // ---- clean any prior run ------------------------------------------
  await db.delete(dealTeamMembers).where(and(eq(dealTeamMembers.dealId, deal.id), like(dealTeamMembers.notes, `${TAG}%`)));
  await db.delete(consultants).where(and(eq(consultants.dealId, deal.id), like(consultants.notes, `${TAG}%`)));

  // ---- fixtures ------------------------------------------------------
  const base = { orgId: deal.orgId, dealId: deal.id, notes: TAG };
  await db.insert(dealTeamMembers).values([
    // Owner Team: free-text principals. One has NO email on purpose.
    { ...base, team: "owner", roleLabel: "Owner", name: "Matt Hamilton", email: "matt@hamiltonldi.example", sortOrder: 1 },
    { ...base, team: "owner", roleLabel: "Trustee", name: "Scott Matsutsuyu", email: "smatsutsuyu@lakebridgecap.example", sortOrder: 2 },
    { ...base, team: "owner", roleLabel: "Owner's Counsel", name: "No Email Person", email: null, sortOrder: 3 },
    // Buyer Team: contact-linked, exercises the contacts branch.
    ...(withEmail[0] ? [{ ...base, team: "buyer" as const, roleLabel: "VP Land Acquisition", contactId: withEmail[0].id, sortOrder: 1 }] : []),
    ...(withEmail[1] ? [{ ...base, team: "buyer" as const, roleLabel: "Land Analyst", contactId: withEmail[1].id, sortOrder: 2 }] : []),
    // Broker Team: an org user (exercises the user branch) + free text.
    ...(orgUsers[0] ? [{ ...base, team: "broker" as const, roleLabel: "Lead Broker", userId: orgUsers[0].id, sortOrder: 1 }] : []),
    { ...base, team: "broker", roleLabel: "Marketing Coordinator", name: "Loan Nguyen", email: "lnguyen@landadvisors.com", sortOrder: 2 },
    { ...base, team: "broker", roleLabel: "Cobroker", name: "Tim Barden", email: "tbarden@cbre.example", sortOrder: 3 },
    // Excluded from emails — must not appear anywhere.
    { ...base, team: "broker", roleLabel: "Analyst", name: "Excluded Person", email: "excluded@nope.example", includeInEmails: false, sortOrder: 4 },
  ]);

  await db.insert(consultants).values([
    { ...base, role: "psa_attorney", side: "seller", firmName: "Allen Matkins", contactName: "Priya Nandakumar", contactEmail: "pnandakumar@allenmatkins.example" },
    { ...base, role: "cost_to_complete", side: "buyer", firmName: "Pacific Coast CMG", contactName: "Devon Alcantar", contactEmail: "dalcantar@hunsakerassoc.example" },
    // No email -> must render as a disabled row, never sendable.
    { ...base, role: "biologist", side: "seller", firmName: "Hunsaker & Associates", contactName: null, contactEmail: null },
    // Duplicate of a broker's address -> must be deduped away.
    { ...base, role: "title", side: "seller", firmName: "Dup Co", contactName: "Dup Person", contactEmail: "TBarden@cbre.EXAMPLE" },
  ]);

  // ---- the action's three queries, verbatim --------------------------
  const [teamRows, consultantRows, orgRows] = await Promise.all([
    db
      .select({
        id: dealTeamMembers.id, team: dealTeamMembers.team, roleLabel: dealTeamMembers.roleLabel,
        userId: dealTeamMembers.userId, contactId: dealTeamMembers.contactId,
        freeName: dealTeamMembers.name, freeEmail: dealTeamMembers.email,
        userName: authUser.name, userEmail: authUser.email,
        contactFirst: contacts.firstName, contactLast: contacts.lastName, contactEmail: contacts.email,
      })
      .from(dealTeamMembers)
      .leftJoin(users, eq(users.id, dealTeamMembers.userId))
      .leftJoin(authUser, eq(authUser.id, users.authUserId))
      .leftJoin(contacts, eq(contacts.id, dealTeamMembers.contactId))
      .where(and(eq(dealTeamMembers.dealId, deal.id), eq(dealTeamMembers.orgId, deal.orgId), eq(dealTeamMembers.includeInEmails, true)))
      .orderBy(dealTeamMembers.team, dealTeamMembers.sortOrder, dealTeamMembers.createdAt),
    db
      .select({ id: consultants.id, role: consultants.role, side: consultants.side, firmName: consultants.firmName, contactName: consultants.contactName, contactEmail: consultants.contactEmail })
      .from(consultants)
      .where(and(eq(consultants.dealId, deal.id), eq(consultants.orgId, deal.orgId)))
      .orderBy(consultants.role, consultants.firmName),
    db
      .select({ id: users.id, name: authUser.name, email: authUser.email })
      .from(users)
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .where(eq(users.orgId, deal.orgId))
      .orderBy(asc(authUser.name)),
  ]);

  const data = buildUnifiedComposerData({ teamRows, consultantRows, orgRows });

  // ---- report --------------------------------------------------------
  const defaults = new Set(data.defaultCcIds);
  console.log("=== TO ===");
  for (const r of data.to) {
    console.log(`  [${r.capLabel.padEnd(6)}] ${r.contactName} <${r.contactEmail}>${r.roleLabel ? "  · " + r.roleLabel : ""}`);
  }
  console.log(`  (dropped for no email: ${data.toWithoutEmail})`);

  console.log("\n=== CC OPTIONS ===");
  for (const o of data.ccOptions) {
    const mark = o.disabled ? "  ✗ disabled" : defaults.has(o.id) ? "  ✓ default" : "";
    console.log(`  ${o.group.padEnd(18)} [${o.capLabel.padEnd(6)}] ${o.name} <${o.email}>${o.roleLabel ? "  · " + o.roleLabel : ""}${mark}${o.disabledNote ? " (" + o.disabledNote + ")" : ""}`);
  }

  console.log("\n=== ASSERTIONS ===");
  const checks: Array<[string, boolean]> = [
    ["To has no address-less member", data.to.every((r) => !!r.contactEmail)],
    ["toWithoutEmail counted the owner with no email", data.toWithoutEmail === 1],
    ["To contains only Owner/Buyer caps", data.to.every((r) => r.capLabel === "Owner" || r.capLabel === "Buyer")],
    ["Buyer Team resolved via contacts join", data.to.some((r) => r.capLabel === "Buyer")],
    ["excluded-from-emails member absent everywhere", ![...data.to.map((r) => r.contactEmail), ...data.ccOptions.map((o) => o.email)].some((e) => (e ?? "").includes("excluded@"))],
    ["no default CC id is disabled", data.ccOptions.filter((o) => defaults.has(o.id)).every((o) => !o.disabled)],
    ["every default CC id exists in options", data.defaultCcIds.every((id) => data.ccOptions.some((o) => o.id === id))],
    ["no duplicate default CC ids", new Set(data.defaultCcIds).size === data.defaultCcIds.length],
    ["marketing coordinator is default-CC'd", data.ccOptions.some((o) => defaults.has(o.id) && o.email.toLowerCase() === "lnguyen@landadvisors.com")],
    ["consultant with no email is disabled", data.ccOptions.some((o) => o.group.startsWith("consultant") && o.disabled)],
    ["case-insensitive dup consultant deduped", data.ccOptions.filter((o) => o.email.toLowerCase() === "tbarden@cbre.example").length === 1],
    ["no CC option duplicates a To address", data.ccOptions.filter((o) => o.email).every((o) => !data.to.some((r) => (r.contactEmail ?? "").toLowerCase() === o.email.toLowerCase()))],
    ["no two CC options share an address", (() => { const e = data.ccOptions.filter((o) => o.email).map((o) => o.email.toLowerCase()); return new Set(e).size === e.length; })()],
    ["sentinel ids are never bare uuids", data.ccOptions.filter((o) => o.group !== "org").every((o) => o.id.includes(":"))],
    ["org-group ids are bare uuids", data.ccOptions.filter((o) => o.group === "org").every((o) => !o.id.includes(":"))],
    ["consultant role labels are humanised", data.ccOptions.filter((o) => o.group.startsWith("consultant")).every((o) => !!o.roleLabel && !o.roleLabel.includes("_"))],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }

  // ---- scenario 2: broker-only roster (the regression the review found)
  // Synthetic rows rather than a DB round-trip: the seed carries its own
  // untagged owner member on this deal, so a broker-only roster is not
  // reachable by inserting fixtures. Scenario 1 already proves the SQL;
  // this exercises the pure fallback branch.
  const freeRow = (id: string, team: "owner" | "broker" | "buyer", roleLabel: string, name: string, email: string | null): TeamRow => ({
    id, team, roleLabel, userId: null, contactId: null, freeName: name, freeEmail: email,
    userName: null, userEmail: null, contactFirst: null, contactLast: null, contactEmail: null,
  });
  const brokerOnly: TeamRow[] = [
    freeRow("b1", "broker", "Lead Broker", "Solo Broker", "solo@landadvisors.example"),
    freeRow("b2", "broker", "Marketing Coordinator", "Loan Nguyen", "lnguyen@landadvisors.com"),
    freeRow("b3", "broker", "Analyst", "No Addr Broker", null),
  ];
  const solo = buildUnifiedComposerData({ teamRows: brokerOnly, consultantRows: [], orgRows: [] });

  console.log("\n=== SCENARIO 2: broker-only roster ===");
  for (const r of solo.to) console.log(`  TO  [${r.capLabel}] ${r.contactName} <${r.contactEmail}>  · ${r.roleLabel}`);
  for (const o of solo.ccOptions) console.log(`  CC  ${o.group.padEnd(8)} ${o.name} <${o.email}>${solo.defaultCcIds.includes(o.id) ? " ✓" : ""}`);
  console.log(`  brokerIsRecipient=${solo.brokerIsRecipient} toWithoutEmail=${solo.toWithoutEmail}`);

  const soloChecks: Array<[string, boolean]> = [
    ["broker-only roster is still sendable", solo.to.length > 0],
    ["fallback flag is set", solo.brokerIsRecipient === true],
    ["brokers moved to To, not CC", solo.to.every((r) => r.capLabel === "Broker") && !solo.ccOptions.some((o) => o.group === "broker")],
    ["addressless broker counted, not silently dropped", solo.toWithoutEmail === 1],
    ["no broker is both To and default-CC", solo.defaultCcIds.every((id) => !id.startsWith("broker:"))],
  ];
  for (const [name, ok] of soloChecks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }

  // ---- scenario 3: nobody addressable at all -------------------------
  const emptyData = buildUnifiedComposerData({ teamRows: [], consultantRows: [], orgRows });
  console.log("\n=== SCENARIO 3: empty roster ===");
  const emptyChecks: Array<[string, boolean]> = [
    ["to is empty so the button can reject before opening", emptyData.to.length === 0],
    ["no default CC ids when there is no send", emptyData.defaultCcIds.length === 0],
  ];
  for (const [name, ok] of emptyChecks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }

  // ---- scenario 4: malformed consultant addresses --------------------
  // Two distinct outcomes are correct here. A stray bracket is the exact
  // shape that caused the live Resend 422, and parseEmailAddress REPAIRS
  // it rather than rejecting — that is the desired behaviour, so long as
  // what lands in the CC option is the cleaned address. Genuine junk
  // ("TBD") has nothing to repair and must end up disabled.
  const bad = buildUnifiedComposerData({
    teamRows: brokerOnly,
    consultantRows: [
      { id: "c1", role: "civil_engineer", side: "seller", firmName: "Bad Co", contactName: "Bracket Addr", contactEmail: "gilad@blackwood.com>" },
      { id: "c2", role: "land_use", side: "seller", firmName: "Wrapped Co", contactName: "Wrapped Addr", contactEmail: "Jane Doe <jane@civil.example>" },
      { id: "c3", role: "biologist", side: "buyer", firmName: "TBD Co", contactName: "Junk Addr", contactEmail: "TBD" },
    ],
    orgRows: [],
  });
  console.log("\n=== SCENARIO 4: malformed consultant addresses ===");
  const badOpts = bad.ccOptions.filter((o) => o.group.startsWith("consultant"));
  for (const o of badOpts) console.log(`  ${o.name.padEnd(14)} email="${o.email}" disabled=${!!o.disabled} note="${o.disabledNote ?? ""}"`);
  const repaired = badOpts.filter((o) => !o.disabled);
  const junk = badOpts.filter((o) => o.disabled);
  const badChecks: Array<[string, boolean]> = [
    ["stray-bracket address is repaired, not dropped", repaired.some((o) => o.email === "gilad@blackwood.com")],
    ["wrapped 'Name <addr>' is unwrapped", repaired.some((o) => o.email === "jane@civil.example")],
    ["no angle bracket survives into any CC address", badOpts.every((o) => !o.email.includes("<") && !o.email.includes(">"))],
    ["unrepairable junk is disabled", junk.length === 1 && junk[0].name === "Junk Addr"],
    ["junk rejection says invalid rather than missing", junk.every((o) => o.disabledNote === "invalid email on file")],
    ["no disabled consultant reaches defaultCcIds", bad.defaultCcIds.every((id) => !junk.some((j) => j.id === id))],
  ];
  for (const [name, ok] of badChecks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }

  // ---- cleanup -------------------------------------------------------
  await db.delete(dealTeamMembers).where(and(eq(dealTeamMembers.dealId, deal.id), like(dealTeamMembers.notes, `${TAG}%`)));
  await db.delete(consultants).where(and(eq(consultants.dealId, deal.id), like(consultants.notes, `${TAG}%`)));
  console.log("\nfixtures removed.");
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
