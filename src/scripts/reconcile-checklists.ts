// Idempotent backfill: ensures every deal's checklist matches the current
// CHECKLIST_TEMPLATE. Adds any missing categories or items in place; never
// removes or renames anything that already exists on a deal.
//
// Run after editing CHECKLIST_TEMPLATE so existing deals pick up the new
// rows. Safe to re-run — does nothing on a deal whose checklist is
// already up to date.
//
// Local against your own DB:
//   npm run checklist:reconcile
//
// Against prod (per the Vercel-env-quirks memory):
//   DATABASE_URL='postgres://...prod...' npm run checklist:reconcile
//
// Flags:
//   --dry-run    Print what would be inserted; don't write.
//   --org=<id>   Limit to a single org (UUID). Default: every org.
//
// .env.local is loaded by `tsx --env-file=.env.local` before any imports run.

import { and, eq } from "drizzle-orm";

import { CHECKLIST_TEMPLATE } from "@/db/checklist-template";
import { db, schema } from "@/db";

type Args = {
  dryRun: boolean;
  orgFilter: string | null;
};

function parseArgs(argv: string[]): Args {
  let dryRun = false;
  let orgFilter: string | null = null;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--org=")) orgFilter = a.slice("--org=".length);
  }
  return { dryRun, orgFilter };
}

// Normalize a string for case-insensitive matching. Names in the DB are
// stored verbatim from the template, but we still compare lowercased to
// guard against accidental whitespace/case drift over time.
function norm(s: string): string {
  return s.trim().toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string) => console.log(args.dryRun ? `[dry-run] ${msg}` : msg);

  // Pull every deal in scope. Org filter when present; otherwise all orgs.
  const dealRows = args.orgFilter
    ? await db
        .select({
          id: schema.deals.id,
          orgId: schema.deals.orgId,
          name: schema.deals.name,
        })
        .from(schema.deals)
        .where(eq(schema.deals.orgId, args.orgFilter))
    : await db
        .select({
          id: schema.deals.id,
          orgId: schema.deals.orgId,
          name: schema.deals.name,
        })
        .from(schema.deals);

  console.log(
    `Reconciling checklists across ${dealRows.length} deal${dealRows.length === 1 ? "" : "s"}` +
      (args.orgFilter ? ` (org=${args.orgFilter})` : "") +
      (args.dryRun ? " — DRY RUN" : ""),
  );

  let addedCategories = 0;
  let addedItems = 0;

  for (const deal of dealRows) {
    // All current categories + items for this deal in one round-trip
    // each. Bucketed by phase so we can match the template phase-by-phase.
    const existingCategories = await db
      .select({
        id: schema.checklistCategories.id,
        phase: schema.checklistCategories.phase,
        name: schema.checklistCategories.name,
        sortOrder: schema.checklistCategories.sortOrder,
      })
      .from(schema.checklistCategories)
      .where(eq(schema.checklistCategories.dealId, deal.id));

    const existingItems = await db
      .select({
        id: schema.checklistItems.id,
        categoryId: schema.checklistItems.categoryId,
        name: schema.checklistItems.name,
        sortOrder: schema.checklistItems.sortOrder,
      })
      .from(schema.checklistItems)
      .innerJoin(
        schema.checklistCategories,
        eq(schema.checklistItems.categoryId, schema.checklistCategories.id),
      )
      .where(eq(schema.checklistCategories.dealId, deal.id));

    // Bucket existing items by category so we can compute the next
    // sort_order when appending. Also build a Set of normalized names
    // per category for fast "already exists?" checks.
    const itemsByCategoryId = new Map<string, typeof existingItems>();
    for (const it of existingItems) {
      const list = itemsByCategoryId.get(it.categoryId) ?? [];
      list.push(it);
      itemsByCategoryId.set(it.categoryId, list);
    }

    let phaseIdx = 0;
    for (const spec of CHECKLIST_TEMPLATE) {
      for (const [catIdx, templateCat] of spec.categories.entries()) {
        // Match category by (phase, normalized name). If absent, create it.
        let category = existingCategories.find(
          (c) => c.phase === spec.phase && norm(c.name) === norm(templateCat.name),
        );

        if (!category) {
          log(
            `+ category [${deal.name}] ${spec.phase} → "${templateCat.name}"`,
          );
          addedCategories++;
          if (!args.dryRun) {
            const [created] = await db
              .insert(schema.checklistCategories)
              .values({
                orgId: deal.orgId,
                dealId: deal.id,
                phase: spec.phase,
                name: templateCat.name,
                sortOrder: phaseIdx * 100 + catIdx,
              })
              .returning();
            category = {
              id: created.id,
              phase: created.phase,
              name: created.name,
              sortOrder: created.sortOrder,
            };
            existingCategories.push(category);
            itemsByCategoryId.set(category.id, []);
          } else {
            // Synthetic placeholder for dry-run so downstream lookups
            // for items in this category can still report. ID is fake.
            category = {
              id: `dry-run-${spec.phase}-${catIdx}`,
              phase: spec.phase,
              name: templateCat.name,
              sortOrder: phaseIdx * 100 + catIdx,
            };
            itemsByCategoryId.set(category.id, []);
          }
        }

        const existingNames = new Set(
          (itemsByCategoryId.get(category.id) ?? []).map((it) => norm(it.name)),
        );
        // Append-at-end strategy. We deliberately don't try to splice new
        // items into the template's middle position — that'd require
        // rewriting sort_order on every row in the category, which (a)
        // risks shuffling untracked or user-added items and (b) is
        // unnecessary for the typical case of new items being added to
        // the end of a phase. If/when we need true mid-list inserts,
        // revisit with a more careful sort_order reconciliation pass.
        let nextSort =
          (itemsByCategoryId.get(category.id) ?? []).reduce(
            (max, it) => Math.max(max, it.sortOrder),
            -1,
          ) + 1;

        for (const templateItem of templateCat.items) {
          const itemName =
            typeof templateItem === "string" ? templateItem : templateItem.name;
          const optional =
            typeof templateItem === "string" ? false : templateItem.optional ?? false;

          if (existingNames.has(norm(itemName))) continue;

          log(`+ item     [${deal.name}] "${templateCat.name}" → "${itemName}"`);
          addedItems++;
          if (!args.dryRun) {
            await db.insert(schema.checklistItems).values({
              orgId: deal.orgId,
              categoryId: category.id,
              name: itemName,
              optional,
              sortOrder: nextSort,
            });
          }
          existingNames.add(norm(itemName));
          nextSort++;
        }
      }
      phaseIdx++;
    }
  }

  console.log(
    `\nDone. Added ${addedCategories} categor${addedCategories === 1 ? "y" : "ies"} and ${addedItems} item${addedItems === 1 ? "" : "s"}.` +
      (args.dryRun ? " (dry run — no writes)" : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
