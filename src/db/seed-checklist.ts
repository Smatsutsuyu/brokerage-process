// Server-only: inserts the full hierarchical checklist for a deal from the
// canonical CHECKLIST_TEMPLATE. Kept separate from `checklist-template.ts`
// because that file is imported by client components (phase-section.tsx) and
// must not pull in the postgres driver via `./index`.

import { CHECKLIST_TEMPLATE } from "./checklist-template";
import { db, schema } from "./index";

type DbHandle = typeof db;

// Caller is responsible for transaction scoping — pass `db` for an
// autocommit insert, or a tx handle to bundle with sibling writes
// (e.g. createDeal does this so a failed checklist insert rolls back the
// deal too).
export async function seedChecklistForDeal(
  client: DbHandle,
  args: { orgId: string; dealId: string },
): Promise<void> {
  let phaseIdx = 0;
  for (const spec of CHECKLIST_TEMPLATE) {
    for (const [catIdx, cat] of spec.categories.entries()) {
      const [category] = await client
        .insert(schema.checklistCategories)
        .values({
          orgId: args.orgId,
          dealId: args.dealId,
          phase: spec.phase,
          name: cat.name,
          sortOrder: phaseIdx * 100 + catIdx,
        })
        .returning();

      const itemRows = cat.items.map((it, idx) => {
        const base = { orgId: args.orgId, categoryId: category.id, sortOrder: idx };
        return typeof it === "string"
          ? { ...base, name: it }
          : { ...base, name: it.name, optional: it.optional ?? false };
      });
      await client.insert(schema.checklistItems).values(itemRows);
    }
    phaseIdx++;
  }
}
