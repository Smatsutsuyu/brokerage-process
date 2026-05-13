// Historical evolution registry for the checklist. Every rename (old name
// to new name) and every explicit deletion ever applied to checklist
// categories or items lives here. Runs as part of vercel-build BEFORE
// reconcile-checklists, so the data lines up with the current
// CHECKLIST_TEMPLATE before reconcile reads it.
//
// Idempotent: re-running matches no rows the second time and is a silent
// no-op. Safe to leave in vercel-build forever; append a new block for
// each future evolution pass.
//
// Why a separate script instead of reconcile-checklists handling these:
// reconcile is "add-only" by design (it never modifies `name` and never
// deletes). That keeps reconcile safe to run automatically. Renames and
// deletes are rare, deliberate, and need explicit instructions, which is
// what this file provides.
//
// Deletes cascade-delete attached links (checklist_item_links has
// onDelete: cascade) but attached documents survive as orphans (documents
// has onDelete: set null on checklistItemId). The script logs counts so
// you see what's being lost before it's gone.
//
// Local against your own DB:
//   npm run rename:apply
//
// Against prod (per the Vercel-env-quirks memory):
//   DATABASE_URL='postgres://...prod...' npm run rename:apply
//
// Flags:
//   --dry-run    Print what would change; don't write.

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/db";

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

type RenameSpec =
  | { type: "category"; phase: Phase; oldName: string; newName: string }
  | { type: "item"; phase: Phase; oldName: string; newName: string }
  | {
      // Drop an item from existing deals. Cascade-deletes any links
      // attached to that item; documents survive as orphans. Use when
      // the template removes an item that previously existed.
      type: "delete-item";
      phase: Phase;
      name: string;
      reason: string;
    };

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

  // 2026-05-13: Phase 4 reconciliation against Marketing Process
  // Checklist.xlsx (v2). Category name + 6 item renames + 1 deletion.
  // Excel typos "Detrmine" and "Re-occuring" deliberately not preserved.
  {
    type: "category",
    phase: "phase_4",
    oldName: "Items",
    newName: "Due Diligence Tracking",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Share All Due Diligence",
    newName: "Share Due Diligence Material / Set Meeting",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Kick Off PSA",
    newName: "Kick off PSA",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Bi-Weekly Meeting Schedule for DD",
    newName: "Schedule Recurring Call",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Determine CTC Date",
    newName: "Determine CTC Due Date",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Issues Tracking Sheet (living document)",
    newName: "Issues Tracking Sheet & Send Out before calls",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Consultant Roster",
    newName: "Create Consultant Roster & Send Out",
  },
  {
    type: "delete-item",
    phase: "phase_4",
    name: "Kickoff Call",
    reason:
      "Not in Excel v2. Folded into 'Share Due Diligence Material / Set Meeting'. Can re-add later if client feedback wants it kept distinct.",
  },
];

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes("--dry-run") };
}

// Helper: subquery selecting all category ids on a given phase. Used to
// scope item lookups so an item with the same name on a different phase
// isn't touched.
function phaseCategoryIdsQuery(phase: Phase) {
  return db
    .select({ id: schema.checklistCategories.id })
    .from(schema.checklistCategories)
    .where(eq(schema.checklistCategories.phase, phase));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string) => console.log(args.dryRun ? `[dry-run] ${msg}` : msg);

  let categoryUpdates = 0;
  let itemUpdates = 0;
  let itemDeletes = 0;
  let noOpOps = 0;

  for (const r of RENAMES) {
    switch (r.type) {
      case "category": {
        // Categories: scoped by phase + old name. Multi-deal safe since the
        // same category name can repeat across deals; we update them all.
        const wherePred = and(
          eq(schema.checklistCategories.phase, r.phase),
          eq(schema.checklistCategories.name, r.oldName),
        );
        if (args.dryRun) {
          const rows = await db
            .select({ id: schema.checklistCategories.id })
            .from(schema.checklistCategories)
            .where(wherePred);
          if (rows.length === 0) {
            noOpOps++;
            log(`  · category "${r.oldName}" not found on phase ${r.phase} (no-op)`);
          } else {
            categoryUpdates += rows.length;
            log(`+ category "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
          }
        } else {
          const result = await db
            .update(schema.checklistCategories)
            .set({ name: r.newName })
            .where(wherePred)
            .returning();
          if (result.length === 0) {
            noOpOps++;
            log(`  · category "${r.oldName}" not found on phase ${r.phase} (no-op)`);
          } else {
            categoryUpdates += result.length;
            log(`+ category "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${result.length} row${result.length === 1 ? "" : "s"})`);
          }
        }
        break;
      }

      case "item": {
        const phaseCategoryIds = phaseCategoryIdsQuery(r.phase);
        const wherePred = and(
          eq(schema.checklistItems.name, r.oldName),
          sql`${schema.checklistItems.categoryId} IN ${phaseCategoryIds}`,
        );
        if (args.dryRun) {
          const rows = await db
            .select({ id: schema.checklistItems.id })
            .from(schema.checklistItems)
            .where(wherePred);
          if (rows.length === 0) {
            noOpOps++;
            log(`  · item "${r.oldName}" not found on phase ${r.phase} (no-op)`);
          } else {
            itemUpdates += rows.length;
            log(`+ item     "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
          }
        } else {
          const result = await db
            .update(schema.checklistItems)
            .set({ name: r.newName })
            .where(wherePred)
            .returning();
          if (result.length === 0) {
            noOpOps++;
            log(`  · item "${r.oldName}" not found on phase ${r.phase} (no-op)`);
          } else {
            itemUpdates += result.length;
            log(`+ item     "${r.oldName}" → "${r.newName}" on phase ${r.phase} (${result.length} row${result.length === 1 ? "" : "s"})`);
          }
        }
        break;
      }

      case "delete-item": {
        // Find every matching item on this phase. We need the IDs both
        // for the delete itself and for counting attached docs/links so
        // we can warn about what's being lost.
        const phaseCategoryIds = phaseCategoryIdsQuery(r.phase);
        const targets = await db
          .select({ id: schema.checklistItems.id })
          .from(schema.checklistItems)
          .where(
            and(
              eq(schema.checklistItems.name, r.name),
              sql`${schema.checklistItems.categoryId} IN ${phaseCategoryIds}`,
            ),
          );

        if (targets.length === 0) {
          noOpOps++;
          log(`  · item "${r.name}" not found on phase ${r.phase} (no-op)`);
          break;
        }

        const targetIds = targets.map((t) => t.id);

        // Count attached docs (orphan after delete, survive) and links
        // (cascade-deleted) so the operator sees what's being lost.
        const [docCount] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.documents)
          .where(inArray(schema.documents.checklistItemId, targetIds));
        const [linkCount] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.checklistItemLinks)
          .where(inArray(schema.checklistItemLinks.checklistItemId, targetIds));

        log(
          `- item     "${r.name}" on phase ${r.phase} (${targets.length} row${targets.length === 1 ? "" : "s"}). reason: ${r.reason}`,
        );
        if ((docCount?.n ?? 0) > 0) {
          log(
            `             ${docCount.n} attached document${docCount.n === 1 ? "" : "s"} will orphan (preserved, but no longer linked).`,
          );
        }
        if ((linkCount?.n ?? 0) > 0) {
          log(
            `             ${linkCount.n} attached link${linkCount.n === 1 ? "" : "s"} will cascade-delete.`,
          );
        }

        if (!args.dryRun) {
          await db
            .delete(schema.checklistItems)
            .where(inArray(schema.checklistItems.id, targetIds));
        }
        itemDeletes += targets.length;
        break;
      }
    }
  }

  console.log(
    `\nDone. ${categoryUpdates} category rename${categoryUpdates === 1 ? "" : "s"}, ` +
      `${itemUpdates} item rename${itemUpdates === 1 ? "" : "s"}, ` +
      `${itemDeletes} item delete${itemDeletes === 1 ? "" : "s"}, ` +
      `${noOpOps} no-op${noOpOps === 1 ? "" : "s"} (already in target state or never existed).` +
      (args.dryRun ? " (dry run, no writes)" : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
