// Generates a markdown report of feedback items, grouped by section,
// optionally filtered by status. Run with `npm run feedback:report`.
//
// Examples:
//   npm run feedback:report                  → all "new" items
//   npm run feedback:report -- --status=all  → every item
//   npm run feedback:report -- --out=docs/feedback-2026-05-01.md
//   DATABASE_URL=postgres://... npm run feedback:report  → run against any DB
//
// This script intentionally bypasses @/db (which imports @/lib/env and
// requires every prod env var). It only needs DATABASE_URL — no auth secret,
// no Resend key — so we construct a thin Drizzle client directly. Makes
// one-off ops use against prod or any other Postgres a one-liner.
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { feedbackItems, type FeedbackItem } from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set it inline (e.g. `DATABASE_URL=... npm run feedback:report`) or via .env.local.",
  );
  process.exit(1);
}

const isNeon = databaseUrl.includes("neon.tech");
const db = isNeon
  ? drizzleNeon({ client: neon(databaseUrl), casing: "snake_case" })
  : drizzlePostgres(postgres(databaseUrl, { max: 1 }), { casing: "snake_case" });

type StatusFilter = "new" | "reviewed" | "actioned" | "wontfix" | "open" | "all";

function parseArgs() {
  const args = process.argv.slice(2);
  let status: StatusFilter = "new";
  let out: string | undefined;
  for (const arg of args) {
    if (arg.startsWith("--status=")) {
      status = arg.slice("--status=".length) as StatusFilter;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    }
  }
  return { status, out };
}

function severitySort(s: FeedbackItem["severity"]): number {
  return { blocker: 0, bug: 1, suggestion: 2, nit: 3 }[s];
}

async function loadItems(status: StatusFilter): Promise<FeedbackItem[]> {
  const baseOrder = [asc(feedbackItems.section), desc(feedbackItems.createdAt)];
  if (status === "all") {
    return db.select().from(feedbackItems).orderBy(...baseOrder);
  }
  if (status === "open") {
    return db
      .select()
      .from(feedbackItems)
      .where(inArray(feedbackItems.status, ["new", "reviewed"]))
      .orderBy(...baseOrder);
  }
  return db
    .select()
    .from(feedbackItems)
    .where(eq(feedbackItems.status, status))
    .orderBy(...baseOrder);
}

function fmt(item: FeedbackItem, idx: number): string {
  const ts = item.createdAt.toISOString().replace("T", " ").slice(0, 16);
  const sha = item.commitSha ? item.commitSha.slice(0, 7) : "—";
  const from = item.userEmail ?? "(unknown)";
  return [
    `### ${idx}. \`${item.severity}\` — ${ts} · build \`${sha}\` · status: \`${item.status}\``,
    `**Page:** \`${item.pagePath}\`  `,
    `**From:** ${from}  `,
    `**ID:** \`${item.id}\``,
    "",
    item.comment,
    "",
  ].join("\n");
}

async function main() {
  const { status, out } = parseArgs();
  const items = await loadItems(status);

  const generated = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines: string[] = [];
  lines.push(`# Feedback Report — generated ${generated}`);
  lines.push("");
  lines.push(`Filter: \`status=${status}\` · ${items.length} item(s)`);
  lines.push("");

  if (items.length === 0) {
    lines.push("_No feedback matching the filter._");
  } else {
    const bySection = new Map<string, FeedbackItem[]>();
    for (const item of items) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
    const sections = [...bySection.keys()].sort();
    for (const section of sections) {
      const sectionItems = bySection
        .get(section)!
        .sort((a, b) => severitySort(a.severity) - severitySort(b.severity));
      lines.push(`## Section: \`${section}\` (${sectionItems.length})`);
      lines.push("");
      sectionItems.forEach((item, i) => lines.push(fmt(item, i + 1)));
    }
  }

  const output = lines.join("\n");
  if (out) {
    writeFileSync(out, output);
    console.log(`Wrote ${items.length} item(s) to ${out}`);
  } else {
    process.stdout.write(output);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
