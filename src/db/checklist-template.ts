// Canonical phase / category / item template applied to every new deal.
// Source of truth — both the seed script and `createDeal` import from here
// so a fresh-seed deal and a UI-created deal end up with identical checklists.
//
// Items are CLAUDE.md verbatim. Phase 1 uses Chris's discovery-spec category
// groupings (Valuation, Third Party Marketing Reports, Marketing Documents,
// plus Listing & Buyer Setup and Underwriting & OM for items not covered).
// Phases 2-4 use a single "Items" bucket since CLAUDE.md doesn't break them
// down further; categories can be split per Chris's preference later without
// schema work.

import { db, schema } from "./index";

export type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

export type TemplateCategory = {
  name: string;
  items: Array<string | { name: string; optional?: boolean }>;
};

export type TemplateSpec = {
  phase: Phase;
  categories: TemplateCategory[];
};

export const CHECKLIST_TEMPLATE: TemplateSpec[] = [
  {
    phase: "phase_1",
    categories: [
      {
        name: "Listing & Buyer Setup",
        items: ["Listing Agreement", "Initial List of Potential Buyers"],
      },
      {
        name: "Third Party Marketing Reports",
        items: [
          "HOA Budget",
          "Cost to Complete",
          "CFD Analysis",
          { name: "Market Study", optional: true },
        ],
      },
      {
        name: "Valuation",
        items: ["Premium Analysis", "Valuation"],
      },
      {
        name: "Marketing Documents",
        items: [
          "Entitlement Schedule",
          { name: "Development Schedule", optional: true },
          "Entitlement Summary",
        ],
      },
      {
        name: "Underwriting & OM",
        items: [
          "Custom Underwriting File for Deal",
          "Offering Memorandum",
          "Marketing Report (Green/Yellow/Red buyer categorization)",
          "Determine PSA Attorney (drafting preference)",
        ],
      },
    ],
  },
  {
    phase: "phase_2",
    categories: [
      {
        name: "Items",
        items: [
          "Send out OM / Blast (personalized by buyer tier)",
          "Request In-Person Meeting with Top (Green) Buyers",
          "Coordinate a Q&A File",
          "Send out Q&A File",
          { name: "Share Market Study", optional: true },
          "Email Notification of Offers Due (X days before)",
          "Day-of Reminder",
          "Automated follow-up to Green & Yellow buyers whose offers haven't come in",
        ],
      },
    ],
  },
  {
    phase: "phase_3",
    categories: [
      {
        name: "Items",
        items: [
          "Schedule Meeting with Ownership",
          "Create Initial Summary (send out as received)",
          "Review Underwriting Sheets for clarification",
          "Run LOI through AI → SOO Matrix",
          "Run UW Sheets through AI → Revenue Charts & UW Summary",
          "PDF everything together",
          "Create Recommendation memo (Pro/Con of each offer)",
        ],
      },
    ],
  },
  {
    phase: "phase_4",
    categories: [
      {
        name: "Items",
        items: [
          "Share All Due Diligence",
          "Kick Off PSA",
          "Kickoff Call",
          "Bi-Weekly Meeting Schedule for DD",
          "Determine CTC Date",
          "Issues Tracking Sheet (living document)",
          "Consultant Roster",
        ],
      },
    ],
  },
];

// Inserts the full hierarchical checklist for a deal. Caller is responsible
// for transaction scoping — pass `db` for an autocommit insert, or a tx
// handle to bundle with sibling writes (e.g. createDeal does this so a
// failed checklist insert rolls back the deal too).
type DbHandle = typeof db;

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
