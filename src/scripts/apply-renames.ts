// Historical rename registry. Every (old name → new name) ever applied
// to checklist categories or items lives here. Runs as part of
// vercel-build BEFORE reconcile-checklists, so renamed rows match the
// current CHECKLIST_TEMPLATE before reconcile reads them.
//
// Idempotent: re-running matches no rows the second time and is a silent
// no-op. Safe to leave in vercel-build forever; append a new block for
// each future rename pass.
//
// Why a separate script instead of reconcile-checklists handling
// renames: reconcile is "add-only" by design (it never modifies the
// `name` column on an existing row). That keeps reconcile safe to run
// automatically. Renames are rare, deliberate, and need an explicit
// old-name → new-name mapping, which is what this file provides.
//
// Local against your own DB:
//   npm run rename:apply
//
// Against prod (per the Vercel-env-quirks memory):
//   DATABASE_URL='postgres://...prod...' npm run rename:apply
//
// Flags:
//   --dry-run    Print what would change; don't write.

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

type RenameSpec =
  | { type: "category"; phase: Phase; oldName: string; newName: string }
  | { type: "item"; phase: Phase; oldName: string; newName: string };

// Append new rename passes BELOW the existing ones. Each pass should
// include a brief comment with the date + reason so the history is
// readable from the file alone.
const RENAMES: RenameSpec[] = [
  // 2026-05-13: Phase 3 reconciliation against Marketing Process
  // Checklist.xlsx (v2). Category name + 6 item renames (decision
  // recorded in MEMORY.md / conversation log).
  //
  // Row 7 ("Create Recommendation memo (Pro/Con of each offer)") is
  // intentionally NOT renamed; we kept the "memo" wording per Sean's
  // decision even though Excel drops it.
  {
    type: "category",
    phase: "phase_3",
    oldName: "Items",
    newName: "Summary of Offers (SOO)",
  },
  {
    type: "item",
    phase: "phase_3",
    oldName: "Schedule Meeting with Ownership",
    newName: "Schedule Summary of Offer Review",
  },
  {
    type: "item",
    phase: "phase_3",
    oldName: "Create Initial Summary (send out as received)",
    newName: "Initial Summary of Offers + LOIS",
  },
  {
    type: "item",
    phase: "phase_3",
    oldName: "Review Underwriting Sheets for clarification",
    newName: "Review Underwriting Sheets for Clarification",
  },
  {
    type: "item",
    phase: "phase_3",
    oldName: "Run LOI through AI → SOO Matrix",
    newName: "Create SOO Matrix",
  },
  {
    // Row 5 split: this rename takes the existing combined item to
    // "Create UW Sheets". The complementary "Create Revenue Charts"
    // gets inserted as a brand-new item by reconcile, since it's the
    // template addition. Anyone who'd previously checked the combined
    // row will see only "Create UW Sheets" as done; "Create Revenue
    // Charts" lands as a fresh open task on every existing deal.
    type: "item",
    phase: "phase_3",
    oldName: "Run UW Sheets through AI → Revenue Charts & UW Summary",
    newName: "Create UW Sheets",
  },
  {
    type: "item",
    phase: "phase_3",
    oldName: "PDF everything together",
    newName: "PDF Everything",
  },
];

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string) => console.log(args.dryRun ? `[dry-run] ${msg}` : msg);

  let categoryUpdates = 0;
  let itemUpdates = 0;
  let noOpRenames = 0;

  for (const r of RENAMES) {
    if (r.type === "category") {
      // Categories: scoped by phase + old name. Multi-deal safe since the
      // same category name can repeat across deals; we update them all.
      if (args.dryRun) {
        const rows = await db
          .select({ id: schema.checklistCategories.id })
          .from(schema.checklistCategories)
          .where(
            and(
              eq(schema.checklistCategories.phase, r.phase),
              eq(schema.checklistCategories.name, r.oldName),
            ),
          );
        if (rows.length === 0) {
          noOpRenames++;
          log(`  · category "${r.oldName}" not found on phase ${r.phase} (no-op)`);
        } else {
          categoryUpdates += rows.length;
          log(`+ category "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
        }
      } else {
        const result = await db
          .update(schema.checklistCategories)
          .set({ name: r.newName })
          .where(
            and(
              eq(schema.checklistCategories.phase, r.phase),
              eq(schema.checklistCategories.name, r.oldName),
            ),
          )
          .returning();
        if (result.length === 0) {
          noOpRenames++;
          log(`  · category "${r.oldName}" not found on phase ${r.phase} (no-op)`);
        } else {
          categoryUpdates += result.length;
          log(`+ category "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${result.length} row${result.length === 1 ? "" : "s"})`);
        }
      }
    } else {
      // Items: scoped to categories on the right phase via subquery, so
      // an item with the same name on a different phase is unaffected.
      const phaseCategoryIds = db
        .select({ id: schema.checklistCategories.id })
        .from(schema.checklistCategories)
        .where(eq(schema.checklistCategories.phase, r.phase));

      if (args.dryRun) {
        const rows = await db
          .select({ id: schema.checklistItems.id })
          .from(schema.checklistItems)
          .where(
            and(
              eq(schema.checklistItems.name, r.oldName),
              sql`${schema.checklistItems.categoryId} IN ${phaseCategoryIds}`,
            ),
          );
        if (rows.length === 0) {
          noOpRenames++;
          log(`  · item "${r.oldName}" not found on phase ${r.phase} (no-op)`);
        } else {
          itemUpdates += rows.length;
          log(`+ item     "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
        }
      } else {
        const result = await db
          .update(schema.checklistItems)
          .set({ name: r.newName })
          .where(
            and(
              eq(schema.checklistItems.name, r.oldName),
              sql`${schema.checklistItems.categoryId} IN ${phaseCategoryIds}`,
            ),
          )
          .returning();
        if (result.length === 0) {
          noOpRenames++;
          log(`  · item "${r.oldName}" not found on phase ${r.phase} (no-op)`);
        } else {
          itemUpdates += result.length;
          log(`+ item     "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${result.length} row${result.length === 1 ? "" : "s"})`);
        }
      }
    }
  }

  console.log(
    `\nDone. ${categoryUpdates} category rename${categoryUpdates === 1 ? "" : "s"}, ${itemUpdates} item rename${itemUpdates === 1 ? "" : "s"}, ${noOpRenames} no-op${noOpRenames === 1 ? "" : "s"} (already in target state or never existed).` +
      (args.dryRun ? " (dry run, no writes)" : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
