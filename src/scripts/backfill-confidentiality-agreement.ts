// One-shot backfill: add the "Confidentiality Agreement" checklist item
// to existing deals' Phase 2 "Items" category. Idempotent — running twice
// is a no-op for deals that already have it.
//
// Run against any DB:
//   DATABASE_URL=... npx tsx src/scripts/backfill-confidentiality-agreement.ts
//
// Decoupled from @/lib/env (no Better Auth / Resend env vars needed) so
// it can be invoked against prod without juggling stubs. Same pattern as
// feedback-report.ts.

import { and, eq, ilike, sql } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

import { checklistCategories, checklistItems } from "@/db/schema";

const NEW_ITEM_NAME = "Confidentiality Agreement";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set inline (e.g. `DATABASE_URL=... npx tsx ...`) or via .env.local.",
  );
  process.exit(1);
}

const isNeon = databaseUrl.includes("neon.tech");
const db = isNeon
  ? drizzleNeon({ client: neon(databaseUrl), casing: "snake_case" })
  : drizzlePostgres(postgres(databaseUrl, { max: 1 }), { casing: "snake_case" });

async function main() {
  // Find every Phase 2 "Items" category across all deals/orgs in this DB.
  // Multi-tenant safe — we don't filter by org because the script's purpose
  // is to retrofit ALL existing deals to match the new template baseline.
  const phaseCategories = await db
    .select({
      id: checklistCategories.id,
      orgId: checklistCategories.orgId,
      dealId: checklistCategories.dealId,
      name: checklistCategories.name,
    })
    .from(checklistCategories)
    .where(eq(checklistCategories.phase, "phase_2"));

  // Per-template, the Phase 2 category is just named "Items". Filter
  // defensively in case other categories ever exist in this phase.
  const targetCategories = phaseCategories.filter(
    (c) => c.name.toLowerCase() === "items",
  );

  console.log(
    `Found ${targetCategories.length} Phase 2 "Items" categor${targetCategories.length === 1 ? "y" : "ies"} across all deals.`,
  );

  let added = 0;
  let skipped = 0;

  for (const category of targetCategories) {
    // Idempotency: skip if a "Confidentiality Agreement" item already exists
    // in this category. Match case-insensitive to be tolerant of any manual
    // variations.
    const [existing] = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.categoryId, category.id),
          ilike(checklistItems.name, NEW_ITEM_NAME),
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    // Bump existing items' sortOrder by 1 so the new item lands at the top.
    await db
      .update(checklistItems)
      .set({ sortOrder: sql`${checklistItems.sortOrder} + 1` })
      .where(eq(checklistItems.categoryId, category.id));

    // Insert at sortOrder 0.
    await db.insert(checklistItems).values({
      orgId: category.orgId,
      categoryId: category.id,
      name: NEW_ITEM_NAME,
      sortOrder: 0,
      optional: false,
      completed: false,
    });

    added++;
    console.log(`  + Added to deal ${category.dealId}`);
  }

  console.log(
    `\nDone. Added: ${added} · Already had it (skipped): ${skipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
