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
    }
  | {
      // Create a category if it doesn't exist on a deal yet. Idempotent.
      // Use when adding a new category in the template AND you need it
      // to exist BEFORE a subsequent move-item op runs (move-item calls
      // create-category internally too, but listing it explicitly keeps
      // the operation log readable).
      type: "create-category";
      phase: Phase;
      name: string;
      reason: string;
    }
  | {
      // Move an item from one category to another within the same deal
      // and phase. Looks up the source category by name, finds the
      // matching item, looks up (or creates) the target category by
      // name, and updates categoryId. Sort order in the new category is
      // appended to the end here; reconcile fixes it on the next pass.
      // Idempotent: NO-OP if the item is already in the target category
      // or doesn't exist in the source.
      type: "move-item";
      phase: Phase;
      itemName: string;
      fromCategoryName: string;
      toCategoryName: string;
      reason: string;
    }
  | {
      // Rename a category, merging into the target if it already
      // exists. Useful when you want to consolidate two categories
      // (e.g. an erroneous earlier reconciliation created two where
      // there should be one).
      //
      // Behavior per deal:
      //   - target missing, source present  -> UPDATE source.name = newName
      //   - target present, source present  -> MOVE source's items into
      //     target, then DELETE source
      //   - target present, source missing  -> NO-OP
      //   - both missing                    -> NO-OP
      //
      // Idempotent: re-running converges on a single target category
      // with all the items.
      type: "merge-categories";
      phase: Phase;
      oldName: string;
      newName: string;
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
  // 2026-05-18: relabel the row to match the new combined Due Diligence
  // Tracking PDF (key dates + issues + deal team + consultants). The
  // row's Send-to-Deal-Team button now sends that combined report.
  {
    type: "item",
    phase: "phase_4",
    oldName: "Issues Tracking Sheet & Send Out before calls",
    newName: "Complete Due Diligence",
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

  // 2026-05-13: Phase 1 reconciliation against Excel v2.
  // Restructure: drop two items, add several, rename most, and split
  // the catch-all Underwriting & OM into Marketing & Documents Setup
  // (new) + a tighter Underwriting & OM. Marketing Report moves
  // across categories.
  {
    type: "category",
    phase: "phase_1",
    oldName: "Listing & Buyer Setup",
    newName: "Listing",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "Listing Agreement",
    newName: "Signed Listing Agreement",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "Cost to Complete",
    newName: "Cost to Complete (CTC)",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "CFD Analysis",
    newName: "CFD analysis (if appropriate)",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "Marketing Report (Green/Yellow/Red buyer categorization)",
    newName: "Marketing Report",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "Determine PSA Attorney (drafting preference)",
    newName: "Determine PSA Attorney (we or they draft)",
  },
  {
    type: "item",
    phase: "phase_1",
    oldName: "Offering Memorandum",
    newName: "Offering Memorandum (OM)",
  },
  {
    type: "delete-item",
    phase: "phase_1",
    name: "HOA Budget",
    reason: "Not in Excel v2. Removed.",
  },
  {
    type: "delete-item",
    phase: "phase_1",
    name: "Initial List of Potential Buyers",
    reason: "Not in Excel v2. The buyer list lives on the Contacts tab anyway.",
  },
  {
    type: "merge-categories",
    phase: "phase_1",
    oldName: "Marketing Documents",
    newName: "Marketing & Documents Setup",
    reason:
      "Excel doesn't separate Marketing Documents from the dropbox/aerials/marketing-report bundle. One category holds the entitlement docs + the misc setup items together. On a clean prod this is a rename; on a deal that already had a stray 'Marketing & Documents Setup' from an earlier reconciliation, this merges the two and keeps everything in one.",
  },
  {
    type: "move-item",
    phase: "phase_1",
    itemName: "Marketing Report",
    fromCategoryName: "Underwriting & OM",
    toCategoryName: "Marketing & Documents Setup",
    reason:
      "Excel groups Marketing Report with the dropbox/aerials setup items, not the underwriting/OM stack.",
  },

  // 2026-05-13: Phase 2 reconciliation against Excel v2.
  // Rename the generic "Items" category, consolidate the Q&A flow into
  // a single "Q&A File" row, drop the Coordinate step, rename the
  // misc items to match Excel verbatim, and let reconcile add the new
  // "Share Marketing Due Diligence Folder" row. Confidentiality
  // Agreement stays (Chris explicitly asked for it earlier; not in
  // Excel but a real workflow step).
  {
    type: "category",
    phase: "phase_2",
    oldName: "Items",
    newName: "Marketing Process",
  },
  {
    type: "item",
    phase: "phase_2",
    oldName: "Send out OM / Blast (personalized by buyer tier)",
    newName: "Send out OM Blast",
  },
  {
    type: "item",
    phase: "phase_2",
    oldName: "Send out Q&A File",
    newName: "Q&A File",
  },
  {
    type: "item",
    phase: "phase_2",
    oldName: "Email Notification of Offers Due (X days before)",
    newName: "Email Notification of Offer Due Date - 1 week before",
  },
  {
    type: "item",
    phase: "phase_2",
    oldName: "Automated follow-up to Green & Yellow buyers whose offers haven't come in",
    newName: "Follow up Missing Offers",
  },
  {
    type: "delete-item",
    phase: "phase_2",
    name: "Coordinate a Q&A File",
    reason:
      "Excel has just 'Q&A File' as one step. Coordinate + Send Out are now one item with both actions on it.",
  },

  // 2026-05-18 — Phase 4 milestone-date items revised per Chris's
  // feedback. The bottom block of "Due Diligence Tracking" moves from
  // 5 items to 7, with semantic adjustments to match the deal lifecycle
  // (LOI / PSA / CTC drafts / IC approval / feasibility waive / close).
  // Existing items get renamed (preserving any data on them) and two
  // brand-new items (LOI Signed Date, PSA Effective Date) get inserted
  // by reconcile from the updated template.
  {
    type: "item",
    phase: "phase_4",
    oldName: "Determine CTC Due Date",
    newName: "Receive 1st Draft Cost to Complete",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Finalize CTC / New Purchase Price",
    newName: "Finalize Cost to Complete / Final Purchase Price",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Investment Committee",
    newName: "Investment Committee Approval",
  },
  {
    type: "item",
    phase: "phase_4",
    oldName: "Feasibility",
    newName: "Waive Feasibility",
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
  let itemMoves = 0;
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

      case "create-category": {
        // Find every deal that doesn't already have a category by this
        // name on this phase. Insert one category row per missing deal.
        // Multi-tenant + multi-deal safe: rows are scoped per (org,
        // deal). sortOrder is a sentinel high number; reconcile fixes
        // it on the next pass.
        const missing = await db
          .select({ dealId: schema.deals.id, orgId: schema.deals.orgId })
          .from(schema.deals)
          .where(
            sql`NOT EXISTS (
              SELECT 1 FROM ${schema.checklistCategories}
              WHERE ${schema.checklistCategories.dealId} = ${schema.deals.id}
                AND ${schema.checklistCategories.phase} = ${r.phase}
                AND ${schema.checklistCategories.name} = ${r.name}
            )`,
          );

        if (missing.length === 0) {
          noOpOps++;
          log(`  · category "${r.name}" already exists on every deal for ${r.phase} (no-op)`);
          break;
        }

        log(
          `+ category "${r.name}" on phase ${r.phase} (${missing.length} deal${missing.length === 1 ? "" : "s"}). reason: ${r.reason}`,
        );
        if (!args.dryRun) {
          await db.insert(schema.checklistCategories).values(
            missing.map((m) => ({
              orgId: m.orgId,
              dealId: m.dealId,
              phase: r.phase,
              name: r.name,
              // High sentinel; reconcile renumbers based on template order.
              sortOrder: 9999,
            })),
          );
        }
        categoryUpdates += missing.length;
        break;
      }

      case "move-item": {
        // For each deal with a source category by this name, find the
        // matching item and move it to the target category. Creates
        // the target category on demand if missing (so move can run
        // before reconcile).
        const sourceCats = await db
          .select({
            id: schema.checklistCategories.id,
            dealId: schema.checklistCategories.dealId,
            orgId: schema.checklistCategories.orgId,
          })
          .from(schema.checklistCategories)
          .where(
            and(
              eq(schema.checklistCategories.phase, r.phase),
              eq(schema.checklistCategories.name, r.fromCategoryName),
            ),
          );

        if (sourceCats.length === 0) {
          noOpOps++;
          log(`  · source category "${r.fromCategoryName}" not found on ${r.phase} (no-op)`);
          break;
        }

        let movesApplied = 0;
        for (const src of sourceCats) {
          // Item to move (may not exist if already moved or never seeded).
          const [item] = await db
            .select({ id: schema.checklistItems.id })
            .from(schema.checklistItems)
            .where(
              and(
                eq(schema.checklistItems.categoryId, src.id),
                eq(schema.checklistItems.name, r.itemName),
              ),
            )
            .limit(1);
          if (!item) continue;

          // Find or create target category on this same deal.
          let [targetCat] = await db
            .select({ id: schema.checklistCategories.id })
            .from(schema.checklistCategories)
            .where(
              and(
                eq(schema.checklistCategories.phase, r.phase),
                eq(schema.checklistCategories.name, r.toCategoryName),
                eq(schema.checklistCategories.dealId, src.dealId),
              ),
            )
            .limit(1);

          if (!targetCat) {
            if (args.dryRun) {
              // Pretend we'd create it; logged once below for the deal.
              targetCat = { id: `dry-run-${src.dealId}` };
            } else {
              const [created] = await db
                .insert(schema.checklistCategories)
                .values({
                  orgId: src.orgId,
                  dealId: src.dealId,
                  phase: r.phase,
                  name: r.toCategoryName,
                  sortOrder: 9999,
                })
                .returning();
              targetCat = { id: created.id };
            }
          }

          // If target already has an item by this name, skip the move
          // (prevents accidental dupes when a previous reconcile inserted
          // a fresh row in the target category).
          const [existingInTarget] = await db
            .select({ id: schema.checklistItems.id })
            .from(schema.checklistItems)
            .where(
              and(
                eq(schema.checklistItems.categoryId, targetCat.id),
                eq(schema.checklistItems.name, r.itemName),
              ),
            )
            .limit(1);
          if (existingInTarget) continue;

          if (!args.dryRun) {
            await db
              .update(schema.checklistItems)
              .set({ categoryId: targetCat.id })
              .where(eq(schema.checklistItems.id, item.id));
          }
          movesApplied++;
        }

        if (movesApplied === 0) {
          noOpOps++;
          log(
            `  · item "${r.itemName}" not in "${r.fromCategoryName}" on any deal (no-op)`,
          );
        } else {
          log(
            `> item     "${r.itemName}" moved from "${r.fromCategoryName}" → "${r.toCategoryName}" on ${r.phase} (${movesApplied} row${movesApplied === 1 ? "" : "s"}). reason: ${r.reason}`,
          );
          itemMoves += movesApplied;
        }
        break;
      }

      case "merge-categories": {
        // For each deal, decide rename vs merge based on whether target
        // already exists. We pull both source and target rows in one
        // query per deal, then act per-deal.
        const allCats = await db
          .select({
            id: schema.checklistCategories.id,
            dealId: schema.checklistCategories.dealId,
            name: schema.checklistCategories.name,
          })
          .from(schema.checklistCategories)
          .where(
            and(
              eq(schema.checklistCategories.phase, r.phase),
              inArray(schema.checklistCategories.name, [r.oldName, r.newName]),
            ),
          );

        const byDeal = new Map<string, { source?: string; target?: string }>();
        for (const c of allCats) {
          const entry = byDeal.get(c.dealId) ?? {};
          if (c.name === r.oldName) entry.source = c.id;
          else if (c.name === r.newName) entry.target = c.id;
          byDeal.set(c.dealId, entry);
        }

        let renamed = 0;
        let merged = 0;
        for (const [dealId, { source, target }] of byDeal) {
          if (!source) continue; // nothing to do
          if (!target) {
            if (!args.dryRun) {
              await db
                .update(schema.checklistCategories)
                .set({ name: r.newName })
                .where(eq(schema.checklistCategories.id, source));
            }
            renamed++;
          } else {
            // Move all items from source to target, then delete source.
            if (!args.dryRun) {
              await db
                .update(schema.checklistItems)
                .set({ categoryId: target })
                .where(eq(schema.checklistItems.categoryId, source));
              await db
                .delete(schema.checklistCategories)
                .where(eq(schema.checklistCategories.id, source));
            }
            merged++;
            log(
              `  · merged "${r.oldName}" into "${r.newName}" on deal ${dealId.slice(0, 8)}…`,
            );
          }
        }

        if (renamed === 0 && merged === 0) {
          noOpOps++;
          log(
            `  · neither "${r.oldName}" nor a merge target "${r.newName}" needs work on ${r.phase} (no-op)`,
          );
        } else {
          log(
            `+ category "${r.oldName}" → "${r.newName}" on ${r.phase} (${renamed} renamed, ${merged} merged). reason: ${r.reason}`,
          );
          categoryUpdates += renamed + merged;
        }
        break;
      }
    }
  }

  console.log(
    `\nDone. ${categoryUpdates} category change${categoryUpdates === 1 ? "" : "s"}, ` +
      `${itemUpdates} item rename${itemUpdates === 1 ? "" : "s"}, ` +
      `${itemDeletes} item delete${itemDeletes === 1 ? "" : "s"}, ` +
      `${itemMoves} item move${itemMoves === 1 ? "" : "s"}, ` +
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
