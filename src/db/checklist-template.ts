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

export type TemplateItem =
  | string
  | { name: string; optional?: boolean; actions?: PlannedItemAction[] };

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
        name: "Listing & Buyer Setup",
        items: ["Listing Agreement", "Initial List of Potential Buyers"],
      },
      {
        name: "Third Party Marketing Reports",
        items: [
          "HOA Budget",
          "Cost to Complete",
          {
            name: "CFD Analysis",
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
        name: "Valuation",
        items: [
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
        name: "Marketing Documents",
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
          "Offering Memorandum",
          {
            name: "Marketing Report (Green/Yellow/Red buyer categorization)",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate PDF",
                feature: "Marketing Report PDF",
                description:
                  "Renders the buyer list grouped by Green / Yellow / Red interest tier as a branded PDF.",
                phase: "phase_2",
              },
            ],
          },
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
          // Per Chris's feedback (2026-05-07): the CA flow is upload + email-out
          // with a custom template. Upload is wired (universal affordance on
          // every row); email-out is deferred Phase 2 work. Surfaces as the
          // standard placeholder until the Resend pipeline lands.
          {
            name: "Confidentiality Agreement",
            actions: [
              {
                kind: "send-email",
                label: "Email to marketing list",
                feature: "Confidentiality Agreement distribution",
                description:
                  "Sends the uploaded CA to all buyers on this deal using a templated email — default body: \"We'd like to share some information on a proposed [X unit] [Type] deal in [City]. We'd like to keep information confidential and are sharing the proposed confidentiality agreement. Please review and let us know if this form works and we will send it out for signatures.\" Editable per send.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Send out OM / Blast (personalized by buyer tier)",
            actions: [
              {
                kind: "send-email",
                label: "Send OM blast",
                feature: "OM blast email",
                description:
                  "Composes templated OM-distribution emails per buyer tier (Green / Yellow), opens a review screen, then sends via Resend.",
                phase: "phase_2",
              },
              {
                kind: "send-email",
                label: "Send to buyers",
                feature: "OM blast email",
                description:
                  "Composes a templated OM-distribution email per buyer tier (Green / Yellow), opens a review screen, then sends via Resend.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Request In-Person Meeting with Top (Green) Buyers",
            actions: [
              {
                kind: "send-email",
                label: "Email Green buyers",
                feature: "In-person meeting request",
                description:
                  "Drafts a templated meeting-request email to all Green-tier buyers on this deal.",
                phase: "phase_2",
              },
            ],
          },
          "Coordinate a Q&A File",
          {
            name: "Send out Q&A File",
            actions: [
              {
                kind: "generate-doc",
                label: "Generate Q&A PDF",
                feature: "Q&A File PDF",
                description:
                  "Renders all approved Q&A items as a Land Advisors-branded PDF ready to distribute.",
                phase: "phase_2",
              },
              {
                kind: "send-email",
                label: "Send to buyers",
                feature: "Q&A distribution email",
                description: "Emails the approved Q&A PDF to all buyers on this deal via Resend.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Share Market Study",
            optional: true,
            actions: [
              {
                kind: "send-email",
                label: "Send to buyers",
                feature: "Market Study distribution",
                description:
                  "Emails the uploaded Market Study to all buyers on this deal via Resend.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Email Notification of Offers Due (X days before)",
            actions: [
              {
                kind: "schedule-reminder",
                label: "Schedule reminders",
                feature: "Offers-due reminder schedule",
                description:
                  "Schedules templated reminder emails: X days before offer deadline, day-of, and day-after follow-up to Green/Yellow buyers without offers.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Day-of Reminder",
            actions: [
              {
                kind: "send-email",
                label: "Send now",
                feature: "Day-of offers-due reminder",
                description: "Sends the day-of offers-due reminder to all buyers on this deal.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Automated follow-up to Green & Yellow buyers whose offers haven't come in",
            actions: [
              {
                kind: "send-email",
                label: "Send follow-up",
                feature: "Follow-up email to non-responders",
                description:
                  "Drafts a templated follow-up to Green/Yellow buyers who have OM Sent but no offer received yet.",
                phase: "phase_2",
              },
            ],
          },
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
          {
            name: "Schedule Meeting with Ownership",
            actions: [
              {
                kind: "send-email",
                label: "Send invite",
                feature: "Ownership meeting invite",
                description: "Drafts a meeting-invite email to the Owner Team for this deal.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Create Initial Summary (send out as received)",
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
          "Review Underwriting Sheets for clarification",
          "Run LOI through AI → SOO Matrix",
          "Run UW Sheets through AI → Revenue Charts & UW Summary",
          {
            name: "PDF everything together",
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
          {
            name: "Share All Due Diligence",
            actions: [
              {
                kind: "send-email",
                label: "Email DD links",
                feature: "Due Diligence distribution",
                description:
                  "Composes an email to the selected Buyer Team with links to all DD documents on this deal.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Kick Off PSA",
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
            name: "Kickoff Call",
            actions: [
              {
                kind: "send-email",
                label: "Send invite",
                feature: "Kickoff call invite",
                description: "Drafts a calendar invite email to the Buyer Team and Owner Team.",
                phase: "phase_2",
              },
            ],
          },
          {
            name: "Bi-Weekly Meeting Schedule for DD",
            actions: [
              {
                kind: "schedule-reminder",
                label: "Schedule meetings",
                feature: "Bi-weekly DD recurring meetings",
                description: "Schedules a recurring bi-weekly DD meeting reminder for this deal.",
                phase: "phase_2",
              },
            ],
          },
          "Determine CTC Date",
          "Issues Tracking Sheet (living document)",
          "Consultant Roster",
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
