// Reconciles every deal's checklist against the current CHECKLIST_TEMPLATE.
// The template is source-of-truth for BOTH presence and order:
//
//   - Items in the template that are missing on a deal → inserted at the
//     correct position (not just appended).
//   - Items present on both sides → sort_order updated when it drifts
//     from the template's index. Existing item rows (with their
//     completed/notes/attachments) are preserved across the reorder.
//   - Items on the deal that aren't in the template → preserved at the
//     end of the category in their existing relative order. Never deleted.
//   - Same three rules applied to categories (per-phase ordering).
//
// Renames are NOT handled. A renamed template item shows up as a new
// addition while the old name stays as an "extra". Renames need a
// one-shot UPDATE first; see the always-backfill memory.
//
// Run after editing CHECKLIST_TEMPLATE. Wired into vercel-build, so the
// next deploy reconciles automatically. To run out-of-band:
//
//   Local against your own DB:
//     npm run checklist:reconcile
//
//   Against prod (per the Vercel-env-quirks memory):
//     DATABASE_URL='postgres://...prod...' npm run checklist:reconcile
//
// Flags:
//   --dry-run    Print what would change; don't write.
//   --org=<id>   Limit to a single org (UUID). Default: every org.

import { and, eq } from "drizzle-orm";

import { CHECKLIST_TEMPLATE, type TemplateItem } from "@/db/checklist-template";
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

// Case-insensitive name match. Names in the DB come straight from the
// template, but we still compare lowercased + trimmed to guard against
// accidental whitespace/case drift.
function norm(s: string): string {
  return s.trim().toLowerCase();
}

function templateItemName(it: TemplateItem): string {
  return typeof it === "string" ? it : it.name;
}

function templateItemOptional(it: TemplateItem): boolean {
  return typeof it === "string" ? false : it.optional ?? false;
}

type ExistingItem = {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
};

type ExistingCategory = {
  id: string;
  phase: "phase_1" | "phase_2" | "phase_3" | "phase_4";
  name: string;
  sortOrder: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string) => console.log(args.dryRun ? `[dry-run] ${msg}` : msg);

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
      (args.dryRun ? " (DRY RUN)" : ""),
  );

  let categoryInserts = 0;
  let categoryReorders = 0;
  let itemInserts = 0;
  let itemReorders = 0;

  for (const deal of dealRows) {
    const existingCategories: ExistingCategory[] = await db
      .select({
        id: schema.checklistCategories.id,
        phase: schema.checklistCategories.phase,
        name: schema.checklistCategories.name,
        sortOrder: schema.checklistCategories.sortOrder,
      })
      .from(schema.checklistCategories)
      .where(eq(schema.checklistCategories.dealId, deal.id));

    const existingItems: ExistingItem[] = await db
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

    const itemsByCategoryId = new Map<string, ExistingItem[]>();
    for (const it of existingItems) {
      const list = itemsByCategoryId.get(it.categoryId) ?? [];
      list.push(it);
      itemsByCategoryId.set(it.categoryId, list);
    }

    let phaseIdx = 0;
    for (const spec of CHECKLIST_TEMPLATE) {
      // ------- categories at this phase -------
      // Existing categories for this phase, in their current order so
      // "extras" preserve their relative ordering on the way out.
      const phaseCats = existingCategories
        .filter((c) => c.phase === spec.phase)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      // Match template categories to existing rows by normalized name.
      // Track which existing rows we've claimed so the leftovers can be
      // identified as "extras" once we're done with the template.
      const claimedCategoryIds = new Set<string>();
      const targetCategories: Array<{
        existing: ExistingCategory | null;
        templateName: string;
      }> = [];

      for (const templateCat of spec.categories) {
        const match = phaseCats.find(
          (c) => !claimedCategoryIds.has(c.id) && norm(c.name) === norm(templateCat.name),
        );
        if (match) claimedCategoryIds.add(match.id);
        targetCategories.push({ existing: match ?? null, templateName: templateCat.name });
      }

      // Extras: existing categories on this phase that the template
      // doesn't mention. Pinned to the end, preserving their original
      // order. Never deleted.
      const extraCategories = phaseCats.filter((c) => !claimedCategoryIds.has(c.id));

      // Apply target order. Sort_order uses the formula
      //   phaseIdx * 100 + position
      // matching seed-checklist.ts's existing convention so a freshly-
      // seeded deal and a reconciled one have identical numbers.
      const finalCategories: Array<{
        existingId: string | null;
        name: string;
        targetSortOrder: number;
      }> = [];
      for (let i = 0; i < targetCategories.length; i++) {
        const t = targetCategories[i];
        finalCategories.push({
          existingId: t.existing?.id ?? null,
          name: t.existing?.name ?? t.templateName,
          targetSortOrder: phaseIdx * 100 + i,
        });
      }
      for (let i = 0; i < extraCategories.length; i++) {
        const e = extraCategories[i];
        finalCategories.push({
          existingId: e.id,
          name: e.name,
          targetSortOrder: phaseIdx * 100 + targetCategories.length + i,
        });
      }

      // Now apply writes: INSERT for new, UPDATE for sort_order changes.
      // Build a parallel array of "this is the category id at position i"
      // so we can drive the item-level pass below.
      const categoryIdByPosition: string[] = [];
      for (const fc of finalCategories) {
        if (fc.existingId == null) {
          log(`+ category [${deal.name}] ${spec.phase} → "${fc.name}"`);
          categoryInserts++;
          if (args.dryRun) {
            // Synthetic id so the item pass can still log under this
            // category in dry-run mode.
            categoryIdByPosition.push(
              `dry-run-${spec.phase}-${fc.targetSortOrder}`,
            );
          } else {
            const [created] = await db
              .insert(schema.checklistCategories)
              .values({
                orgId: deal.orgId,
                dealId: deal.id,
                phase: spec.phase,
                name: fc.name,
                sortOrder: fc.targetSortOrder,
              })
              .returning();
            existingCategories.push({
              id: created.id,
              phase: created.phase,
              name: created.name,
              sortOrder: created.sortOrder,
            });
            categoryIdByPosition.push(created.id);
          }
        } else {
          const cur = existingCategories.find((c) => c.id === fc.existingId)!;
          if (cur.sortOrder !== fc.targetSortOrder) {
            log(
              `↕ category [${deal.name}] ${spec.phase} → "${fc.name}" (${cur.sortOrder} → ${fc.targetSortOrder})`,
            );
            categoryReorders++;
            if (!args.dryRun) {
              await db
                .update(schema.checklistCategories)
                .set({ sortOrder: fc.targetSortOrder })
                .where(eq(schema.checklistCategories.id, fc.existingId));
              cur.sortOrder = fc.targetSortOrder;
            }
          }
          categoryIdByPosition.push(fc.existingId);
        }
      }

      // ------- items per category -------
      // For each template category (NOT the extras, which we don't
      // reorder inside; they stay as-is), reconcile its items.
      for (let i = 0; i < spec.categories.length; i++) {
        const templateCat = spec.categories[i];
        const categoryId = categoryIdByPosition[i];
        const isSynthetic = categoryId.startsWith("dry-run-");
        const currentItems = isSynthetic ? [] : (itemsByCategoryId.get(categoryId) ?? []);

        // Sort existing items by their current sort_order so extras
        // preserve their relative ordering on the way out.
        const sortedCurrent = [...currentItems].sort((a, b) => a.sortOrder - b.sortOrder);

        // Match template items → existing rows.
        const claimedItemIds = new Set<string>();
        const targetItems: Array<{
          existing: ExistingItem | null;
          templateEntry: TemplateItem;
        }> = [];

        for (const templateItem of templateCat.items) {
          const name = templateItemName(templateItem);
          const match = sortedCurrent.find(
            (it) => !claimedItemIds.has(it.id) && norm(it.name) === norm(name),
          );
          if (match) claimedItemIds.add(match.id);
          targetItems.push({ existing: match ?? null, templateEntry: templateItem });
        }
        const extraItems = sortedCurrent.filter((it) => !claimedItemIds.has(it.id));

        // Apply writes.
        for (let j = 0; j < targetItems.length; j++) {
          const t = targetItems[j];
          const targetSort = j;
          const templateName = templateItemName(t.templateEntry);
          if (t.existing == null) {
            log(`+ item     [${deal.name}] "${templateCat.name}" → "${templateName}" @ ${targetSort}`);
            itemInserts++;
            if (!args.dryRun && !isSynthetic) {
              await db.insert(schema.checklistItems).values({
                orgId: deal.orgId,
                categoryId,
                name: templateName,
                optional: templateItemOptional(t.templateEntry),
                sortOrder: targetSort,
              });
            }
          } else if (t.existing.sortOrder !== targetSort) {
            log(
              `↕ item     [${deal.name}] "${templateCat.name}" → "${templateName}" (${t.existing.sortOrder} → ${targetSort})`,
            );
            itemReorders++;
            if (!args.dryRun) {
              await db
                .update(schema.checklistItems)
                .set({ sortOrder: targetSort })
                .where(eq(schema.checklistItems.id, t.existing.id));
              t.existing.sortOrder = targetSort;
            }
          }
        }
        // Extras: pin to the end, preserve relative order. Update only
        // if their current sort_order doesn't already match the target.
        for (let k = 0; k < extraItems.length; k++) {
          const e = extraItems[k];
          const targetSort = targetItems.length + k;
          if (e.sortOrder !== targetSort) {
            log(
              `↕ item     [${deal.name}] "${templateCat.name}" → "${e.name}" (${e.sortOrder} → ${targetSort}) [extra]`,
            );
            itemReorders++;
            if (!args.dryRun) {
              await db
                .update(schema.checklistItems)
                .set({ sortOrder: targetSort })
                .where(eq(schema.checklistItems.id, e.id));
              e.sortOrder = targetSort;
            }
          }
        }
      }
      phaseIdx++;
    }
  }

  console.log(
    `\nDone. ${categoryInserts} categor${categoryInserts === 1 ? "y" : "ies"} added, ` +
      `${categoryReorders} reordered. ${itemInserts} item${itemInserts === 1 ? "" : "s"} added, ` +
      `${itemReorders} reordered.` +
      (args.dryRun ? " (dry run, no writes)" : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
