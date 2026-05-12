// One-shot backup of the tables touched (or read) by upcoming migrations.
// Writes a self-contained SQL file with INSERT statements for every row in
// the listed tables, so a worst-case "I broke prod" recovery is a single
// `psql DATABASE_URL < backup.sql` after truncating the affected tables.
//
// Usage:
//   DATABASE_URL=... npx tsx src/scripts/backup-prod-tables.ts
//
// File lands in backups/ (gitignored) named with the current timestamp.
//
// Decoupled from @/lib/env (no Better Auth / Resend env vars required).

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

// Tables to back up. Add new ones as the migration scope changes — this
// script is meant to be edited per-migration, not held immutable. Order
// matters for FK-aware restore: parents first.
const TABLES = ["organizations", "deals", "builders", "contacts", "deal_buyers"];

function quote(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1 });
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const out: string[] = [
      `-- Backup taken ${new Date().toISOString()}`,
      `-- Source: ${new URL(databaseUrl!).hostname}`,
      `-- Tables: ${TABLES.join(", ")}`,
      `--`,
      `-- Restore: TRUNCATE the listed tables in reverse order, then run:`,
      `--   psql "$DATABASE_URL" < <this-file>`,
      ``,
    ];

    for (const t of TABLES) {
      // Explicit `public.` schema qualifier — Neon's pooled connection sets
      // an empty search_path by default, so unqualified table names fail to
      // resolve.
      const rows = await sql.unsafe(`SELECT * FROM public."${t}"`);
      out.push(`-- ${t}: ${rows.length} rows`);
      if (rows.length === 0) {
        out.push(``);
        continue;
      }
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      for (const r of rows) {
        const values = cols.map((c) => quote(r[c])).join(", ");
        out.push(`INSERT INTO public."${t}" (${colList}) VALUES (${values});`);
      }
      out.push(``);
    }

    mkdirSync("backups", { recursive: true });
    const path = join("backups", `prod-${ts}.sql`);
    writeFileSync(path, out.join("\n"));
    console.log(`Wrote ${path} — ${out.length} lines, ${TABLES.length} tables`);
  } finally {
    await sql.end();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
