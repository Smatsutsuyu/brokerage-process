// Updates feedback item status (and optionally response text) from the
// command line. Companion to `feedback:report` so an ops session can
// triage items without needing to log into /admin/feedback in a browser.
//
// Examples:
//   npm run feedback:update -- --id=7942b434-... --status=actioned
//   npm run feedback:update -- --id=7942b434-... --status=actioned --response="Switched to hide-by-default toggle"
//   npm run feedback:update -- --ids=id1,id2,id3 --status=reviewed
//   npm run feedback:update -- --status=actioned --where-status=reviewed   # bulk transition
//   DATABASE_URL=postgres://...neon.tech/... npm run feedback:update -- --id=... --status=actioned
//
// Status values: new | reviewed | actioned | complete | wontfix
//
// Timestamp behavior matches the /admin/feedback server action exactly:
//   - new       → clears reviewedAt and actionedAt
//   - reviewed  → sets reviewedAt (preserves if already set), clears actionedAt
//   - wontfix   → same as reviewed
//   - actioned  → sets reviewedAt and actionedAt (preserves if already set)
//   - complete  → same as actioned (complete implies prior actioned)
//
// Like feedback-report.ts, this script bypasses @/db so it only needs
// DATABASE_URL — no auth secret, no Resend key. Makes one-off ops use
// against prod a clean one-liner.
import { neon } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { feedbackItems } from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set it inline (e.g. `DATABASE_URL=... npm run feedback:update`) or via .env.local.",
  );
  process.exit(1);
}

const isNeon = databaseUrl.includes("neon.tech");
const db = isNeon
  ? drizzleNeon({ client: neon(databaseUrl), casing: "snake_case" })
  : drizzlePostgres(postgres(databaseUrl, { max: 1 }), { casing: "snake_case" });

type Status = "new" | "reviewed" | "actioned" | "complete" | "wontfix";
const VALID_STATUSES: Status[] = ["new", "reviewed", "actioned", "complete", "wontfix"];

type Args = {
  ids: string[];
  status: Status;
  response: string | undefined;
  whereStatus: Status | undefined;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let id: string | undefined;
  let idsCsv: string | undefined;
  let status: string | undefined;
  let response: string | undefined;
  let whereStatus: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--id=")) id = arg.slice("--id=".length);
    else if (arg.startsWith("--ids=")) idsCsv = arg.slice("--ids=".length);
    else if (arg.startsWith("--status=")) status = arg.slice("--status=".length);
    else if (arg.startsWith("--response=")) response = arg.slice("--response=".length);
    else if (arg.startsWith("--where-status=")) {
      whereStatus = arg.slice("--where-status=".length);
    }
  }

  if (!status) bail("--status=<new|reviewed|actioned|complete|wontfix> is required");
  if (!VALID_STATUSES.includes(status as Status)) {
    bail(`Invalid --status: ${status}. Must be one of ${VALID_STATUSES.join(", ")}`);
  }

  const ids: string[] = [];
  if (id) ids.push(id);
  if (idsCsv) ids.push(...idsCsv.split(",").map((s) => s.trim()).filter(Boolean));

  // Allow either explicit ids OR a where-status bulk transition, but not
  // both (a bulk update with a specific id list is just N targeted updates).
  if (ids.length > 0 && whereStatus) {
    bail("Pass either --id/--ids OR --where-status, not both.");
  }
  if (ids.length === 0 && !whereStatus) {
    bail("Provide --id=<uuid>, --ids=<uuid,uuid>, or --where-status=<status> to select items.");
  }
  if (whereStatus && !VALID_STATUSES.includes(whereStatus as Status)) {
    bail(`Invalid --where-status: ${whereStatus}. Must be one of ${VALID_STATUSES.join(", ")}`);
  }

  return {
    ids,
    status: status as Status,
    response,
    whereStatus: whereStatus as Status | undefined,
  };
}

function bail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// Compute the timestamp updates for a status transition. Mirrors the
// logic in src/app/(app)/admin/feedback/actions.ts so script-side and
// UI-side updates produce identical rows.
function timestampUpdate(
  next: Status,
  existing: { reviewedAt: Date | null; actionedAt: Date | null },
  now: Date,
): { reviewedAt: Date | null; actionedAt: Date | null } {
  if (next === "new") {
    return { reviewedAt: null, actionedAt: null };
  }
  if (next === "actioned" || next === "complete") {
    return {
      reviewedAt: existing.reviewedAt ?? now,
      actionedAt: existing.actionedAt ?? now,
    };
  }
  // reviewed | wontfix → reviewed but no work shipped.
  return { reviewedAt: existing.reviewedAt ?? now, actionedAt: null };
}

async function loadTargets(args: Args): Promise<
  { id: string; reviewedAt: Date | null; actionedAt: Date | null; status: Status }[]
> {
  if (args.ids.length > 0) {
    const rows = await db
      .select({
        id: feedbackItems.id,
        reviewedAt: feedbackItems.reviewedAt,
        actionedAt: feedbackItems.actionedAt,
        status: feedbackItems.status,
      })
      .from(feedbackItems)
      .where(inArray(feedbackItems.id, args.ids));
    return rows.map((r) => ({ ...r, status: r.status as Status }));
  }
  // whereStatus path
  const rows = await db
    .select({
      id: feedbackItems.id,
      reviewedAt: feedbackItems.reviewedAt,
      actionedAt: feedbackItems.actionedAt,
      status: feedbackItems.status,
    })
    .from(feedbackItems)
    .where(eq(feedbackItems.status, args.whereStatus!));
  return rows.map((r) => ({ ...r, status: r.status as Status }));
}

async function main() {
  const args = parseArgs();
  const targets = await loadTargets(args);

  if (targets.length === 0) {
    console.log("No feedback items matched. Nothing to update.");
    return;
  }

  // Warn loudly when --ids included unknown UUIDs so the operator notices
  // rather than assuming success.
  if (args.ids.length > 0 && targets.length !== args.ids.length) {
    const found = new Set(targets.map((t) => t.id));
    const missing = args.ids.filter((id) => !found.has(id));
    console.warn(`Note: ${missing.length} id(s) not found:\n  ${missing.join("\n  ")}`);
  }

  const now = new Date();
  let updated = 0;
  for (const t of targets) {
    const ts = timestampUpdate(args.status, t, now);
    const update: {
      status: Status;
      reviewedAt: Date | null;
      actionedAt: Date | null;
      response?: string | null;
    } = {
      status: args.status,
      reviewedAt: ts.reviewedAt,
      actionedAt: ts.actionedAt,
    };
    // Only touch response when --response was passed; empty string clears
    // it (consistent with the UI's "save empty textarea = clear" behavior).
    if (args.response !== undefined) {
      update.response = args.response.trim() || null;
    }
    await db.update(feedbackItems).set(update).where(eq(feedbackItems.id, t.id));
    updated++;
    console.log(`  ${t.id}  ${t.status} → ${args.status}`);
  }

  console.log(`\nUpdated ${updated} feedback item(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  // postgres-js keeps the connection pool open by default. Force exit so
  // the script doesn't hang for ~10s after the work is done.
  .finally(() => process.exit(0));
