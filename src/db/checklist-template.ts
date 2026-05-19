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
//
// Per-item placeholder actions (Phase 2 buttons) live inline next to each
// item so the name and its actions can never drift apart. The `ACTION_INDEX`
// at the bottom is built from this template — `getPlannedActionsForItem`
// is the lookup phase-section.tsx uses at render time. As real Phase 2
// handlers land, replace `actions` entries with real wiring (or remove them
// and wire directly in phase-section.tsx).

// This file is imported by client components (phase-section.tsx) — keep it
// pure data + browser-safe helpers. The DB write logic lives in
// `./seed-checklist.ts` so the postgres driver doesn't get bundled into the
// browser chunk.

import type { PlannedPhase } from "@/components/planned-action";

export type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

export type ItemActionKind = "send-email" | "generate-doc" | "generate-xlsx" | "schedule-reminder";

export type PlannedItemAction = {
  kind: ItemActionKind;
  label: string;
  feature: string;
  description: string;
  phase: PlannedPhase;
};

// Tab keys an item can link to. Renders as a small "Open [Tab]" button
// on the row so a user can jump from the checklist context into the
// surface where the item's data lives (e.g. "Issues Tracking" on Phase
// 4 jumps to the Issues tab; "Create Consultant Roster" jumps to the
// Consultants tab). String literals match the DealTabs `?tab=` keys.
export type LinksToTab =
  | "checklist"
  | "contacts"
  | "qa"
  | "issues"
  | "consultants"
  | "team";

export type TemplateItem =
  | string
  | {
      name: string;
      optional?: boolean;
      actions?: PlannedItemAction[];
      // Items with `dateField: true` get a milestone-date affordance on
      // the row (date chip + native picker). Used for Phase 4 CTC / IC /
      // Feasibility / Closing milestones. The value lives on
      // checklist_items.tracked_date; the flag here just tells the UI to
      // surface the picker.
      dateField?: boolean;
      // When set, the row gets a small "Open [tab]" button that
      // navigates to the matching tab on this deal. Used to bridge
      // checklist rows that reference data living in a sibling tab
      // (e.g. Phase 4 "Issues Tracking Sheet" -> Issues tab).
      linksTo?: LinksToTab;
    };

export type TemplateCategory = {
  name: string;
  items: TemplateItem[];
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
        name: "Listing",
        items: ["Signed Listing Agreement"],
      },
      {
        name: "Valuation",
        items: [
          "CMA",
          {
            name: "Premium Analysis",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Premium Analysis PDF",
                description:
                  "Renders a Land Advisors-branded Premium Analysis PDF from this deal's pricing inputs.",
                phase: "phase_2",
              },
            ],
          },
          "RPA",
          {
            name: "Valuation",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Valuation PDF",
                description:
                  "Renders a Land Advisors-branded Valuation PDF from this deal's CMA / Premium / RPA inputs.",
                phase: "phase_2",
              },
            ],
          },
        ],
      },
      {
        name: "Third Party Marketing Reports",
        items: [
          "Cost to Complete (CTC)",
          "Dry Utility Budget (if separate from CTC)",
          {
            name: "CFD analysis (if appropriate)",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "CFD Analysis PDF",
                description:
                  "Renders a Land Advisors-branded PDF using the CFD template populated from this deal's structured data.",
                phase: "phase_2",
              },
            ],
          },
          { name: "Market Study", optional: true },
        ],
      },
      {
        // Single category holding the entitlement documents + the misc
        // setup items (Marketing Report, dropbox folders, aerials).
        // Renamed from "Marketing Documents" via apply-renames so
        // existing deals merge cleanly.
        name: "Marketing & Documents Setup",
        items: [
          {
            name: "Entitlement Schedule",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Entitlement Schedule PDF",
                description:
                  "Renders the Entitlement Schedule template as a Land Advisors-branded PDF.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Development Schedule",
            optional: true,
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Development Schedule PDF",
                description: "Renders the Development Schedule template as a branded PDF.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Entitlement Summary",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Entitlement Summary PDF",
                description: "Renders the Entitlement Summary template as a branded PDF.",
                phase: "phase_2",
              },
            ],
          },
          // Marketing Report row's "Marketing Report" PDF download is
          // real, wired in phase-section.tsx via isMarketingReportItem.
          // Same component as the Contacts tab toolbar button.
          "Marketing Report",
          "Create Marketing Dropbox Folder",
          "Create Full Due Diligence Dropbox Folder",
          { name: "Fly Aerials", optional: true },
        ],
      },
      {
        name: "Underwriting & OM",
        items: [
          {
            name: "Custom Underwriting File for Deal",
            actions: [
              {
                kind: "generate-xlsx",
                label: "Generate Excel",
                feature: "Custom Underwriting File",
                description:
                  "Generates a populated copy of the standard UW Excel template using this deal's data.",
                phase: "phase_2",
              },
            ],
          },
          // Offering Memorandum: prose generation is explicitly out of scope
          // (deferred AI engagement). Upload is the universal action so no
          // item-specific affordance here.
          "Offering Memorandum (OM)",
          "Determine PSA Attorney (we or they draft)",
        ],
      },
    ],
  },
  {
    phase: "phase_2",
    categories: [
      {
        name: "Marketing Process",
        items: [
          // Confidentiality Agreement is not in Excel v2 but Chris
          // explicitly asked for it earlier (2026-05-07). Real workflow
          // step. "Send CA" button wired in phase-section via isCaItem.
          "Confidentiality Agreement",
          // OM Blast row's "Send OM blast" button is real, wired via
          // isOmBlastItem() in phase-section.tsx.
          "Send out OM Blast",
          // Send to Green wired in phase-section via isInPersonMeetingItem.
          "Request In-Person Meeting with Top (Green) Buyers",
          // Q&A File: "Generate PDF" + "Send Q&A" both real now, wired
          // in phase-section via isQaFileItem.
          "Q&A File",
          // Send Market Study wired in phase-section via isShareMarketStudyItem.
          { name: "Share Market Study", optional: true },
          // New per Excel v2: Share Marketing Due Diligence Folder.
          // Excel says "will put in OM" so this is essentially a
          // checkbox + link affordance (Dropbox folder URL).
          "Share Marketing Due Diligence Folder",
          // 1-week notice / Day-of / Follow-up Missing Offers all wired
          // in phase-section via the corresponding row matchers.
          "Email Notification of Offer Due Date - 1 week before",
          "Day-of Reminder",
          "Follow up Missing Offers",
        ],
      },
    ],
  },
  {
    phase: "phase_3",
    categories: [
      {
        name: "Summary of Offers (SOO)",
        items: [
          // Send invite wired in phase-section via isScheduleSooReviewItem.
          "Schedule Summary of Offer Review",
          {
            name: "Initial Summary of Offers + LOIS",
            actions: [
              {
                kind: "send-email",
                label: "Email Owner Team",
                feature: "Initial offer summary",
                description:
                  "Drafts a summary email to Owner Team listing offers received to date.",
                phase: "phase_2",
              },
            ],
          },
          "Review Underwriting Sheets for Clarification",
          "Create SOO Matrix",
          "Create UW Sheets",
          "Create Revenue Charts",
          {
            name: "PDF Everything",
            actions: [
              {
                kind: "generate-doc",
                label: "Compile package",
                feature: "Compiled offer package PDF",
                description:
                  "Merges the SOO matrix, underwriting summaries, revenue charts, and supporting docs into a single PDF for ownership review.",
                phase: "phase_2",
              },
            ],
          },
          "Create Recommendation memo (Pro/Con of each offer)",
          "Finalize B&F Group and Counter Terms",
          "Send out B&F",
          "Buyer Interviews",
          "Create B&F Recommendation, Pro Con of each Offer",
          "Select Buyer",
          "Sign LOI",
        ],
      },
    ],
  },
  {
    phase: "phase_4",
    categories: [
      {
        name: "Due Diligence Tracking",
        items: [
          { name: "Create Consultant Roster & Send Out", linksTo: "consultants" },
          // Share DD Material's "Send to Deal Team" button is now real,
          // wired in phase-section.tsx via isShareDdMaterialItem ->
          // ShareDdMaterialRowActions. No PlannedAction placeholder
          // needed.
          "Share Due Diligence Material / Set Meeting",
          "Create Index of Due Diligence Material",
          {
            name: "Kick off PSA",
            actions: [
              {
                kind: "send-email",
                label: "Notify PSA Attorney",
                feature: "PSA kickoff email",
                description: "Drafts a kickoff email to the chosen PSA Attorney for this deal.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Schedule Recurring Call",
            actions: [
              {
                kind: "schedule-reminder",
                label: "Schedule meetings",
                feature: "Recurring DD call reminders",
                description:
                  "Schedules a recurring DD call reminder for this deal.",
                phase: "phase_2",
              },
            ],
          },
          { name: "Complete Due Diligence", linksTo: "issues" },
          // Milestone date-fields below. Chris populates projected dates
          // via the +Date affordance up front and checks them off as each
          // milestone hits. Ordering is the deal lifecycle: LOI signed,
          // PSA effective, CTC drafts, IC approval, feasibility waive,
          // close.
          { name: "LOI Signed Date", dateField: true },
          { name: "PSA Effective Date", dateField: true },
          { name: "Receive 1st Draft Cost to Complete", dateField: true },
          { name: "Finalize Cost to Complete / Final Purchase Price", dateField: true },
          { name: "Investment Committee Approval", dateField: true },
          { name: "Waive Feasibility", dateField: true },
          { name: "Closing Date", dateField: true },
        ],
      },
    ],
  },
];

// Built once at module load by walking the template. Because the index keys
// derive from the same item names that get inserted into the DB, the lookup
// can never silently miss a row — if you rename an item here, both the DB
// seed and the action lookup move together.
const ACTION_INDEX: Map<string, PlannedItemAction[]> = (() => {
  const map = new Map<string, PlannedItemAction[]>();
  for (const spec of CHECKLIST_TEMPLATE) {
    for (const cat of spec.categories) {
      for (const it of cat.items) {
        if (typeof it === "string") continue;
        if (!it.actions || it.actions.length === 0) continue;
        map.set(it.name.trim().toLowerCase(), it.actions);
      }
    }
  }
  return map;
})();

export function getPlannedActionsForItem(name: string): PlannedItemAction[] {
  return ACTION_INDEX.get(name.trim().toLowerCase()) ?? [];
}

// Names (normalized) of every template item flagged with dateField: true.
// Render layer uses this to decide whether to show the milestone-date
// chip on a row. Same name-keyed lookup pattern as ACTION_INDEX.
const DATE_FIELD_INDEX: Set<string> = (() => {
  const set = new Set<string>();
  for (const spec of CHECKLIST_TEMPLATE) {
    for (const cat of spec.categories) {
      for (const it of cat.items) {
        if (typeof it === "string") continue;
        if (it.dateField) set.add(it.name.trim().toLowerCase());
      }
    }
  }
  return set;
})();

export function isItemDateField(name: string): boolean {
  return DATE_FIELD_INDEX.has(name.trim().toLowerCase());
}

// Map of normalized item name -> the tab key it links to. Render layer
// uses this to decide whether to show the "Open [tab]" button on a row.
const LINKS_TO_INDEX: Map<string, LinksToTab> = (() => {
  const map = new Map<string, LinksToTab>();
  for (const spec of CHECKLIST_TEMPLATE) {
    for (const cat of spec.categories) {
      for (const it of cat.items) {
        if (typeof it === "string") continue;
        if (it.linksTo) map.set(it.name.trim().toLowerCase(), it.linksTo);
      }
    }
  }
  return map;
})();

export function getLinksToForItem(name: string): LinksToTab | null {
  return LINKS_TO_INDEX.get(name.trim().toLowerCase()) ?? null;
}
