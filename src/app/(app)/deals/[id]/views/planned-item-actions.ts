// Maps checklist item names → the placeholder action buttons that should
// appear on the row. Used by phase-section.tsx to render planned actions
// without hardcoding per-item logic in the JSX. The matching is name-based
// because items don't have stable ids across deals (they're seeded fresh).
//
// Universal actions (Upload, Link Dropbox) are layered on top of this in
// phase-section.tsx — the entries here are only for item-SPECIFIC affordances
// like "Send Email", "Generate PDF", etc.

import type { PlannedPhase } from "@/components/planned-action";

export type ItemActionKind = "send-email" | "generate-doc" | "generate-xlsx" | "schedule-reminder";

export type PlannedItemAction = {
  kind: ItemActionKind;
  label: string;
  feature: string;
  description: string;
  phase: PlannedPhase;
};

// Match by lowercased exact name. Some entries match by prefix (see helper).
const EXACT: Record<string, PlannedItemAction[]> = {
  // --- Phase 1 items (going to market) ---
  "cfd analysis": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "CFD Analysis PDF",
      description:
        "Renders a Land Advisors-branded PDF using the CFD template populated from this deal's structured data.",
      phase: "phase_2",
    },
  ],
  "premium analysis": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Premium Analysis PDF",
      description:
        "Renders a Land Advisors-branded Premium Analysis PDF from this deal's pricing inputs.",
      phase: "phase_2",
    },
  ],
  valuation: [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Valuation PDF",
      description:
        "Renders a Land Advisors-branded Valuation PDF from this deal's CMA / Premium / RPA inputs.",
      phase: "phase_2",
    },
  ],
  "entitlement schedule": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Entitlement Schedule PDF",
      description:
        "Renders the Entitlement Schedule template as a Land Advisors-branded PDF.",
      phase: "phase_2",
    },
  ],
  "development schedule": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Development Schedule PDF",
      description: "Renders the Development Schedule template as a branded PDF.",
      phase: "phase_2",
    },
  ],
  "entitlement summary": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Entitlement Summary PDF",
      description: "Renders the Entitlement Summary template as a branded PDF.",
      phase: "phase_2",
    },
  ],
  "custom underwriting file for deal": [
    {
      kind: "generate-xlsx",
      label: "Generate Excel",
      feature: "Custom Underwriting File",
      description:
        "Generates a populated copy of the standard UW Excel template using this deal's data.",
      phase: "phase_2",
    },
  ],
  "marketing report": [
    {
      kind: "generate-doc",
      label: "Generate PDF",
      feature: "Marketing Report PDF",
      description:
        "Renders the buyer list grouped by Green / Yellow / Red interest tier as a branded PDF.",
      phase: "phase_2",
    },
  ],
  "offering memorandum": [
    // OM prose generation is explicitly out of scope (deferred AI engagement).
    // We still want a placeholder for "upload final OM" — but Upload is the
    // universal action so nothing item-specific here.
  ],

  // --- Phase 2 items (marketing process) ---
  "send out om / blast": [
    {
      kind: "send-email",
      label: "Send to buyers",
      feature: "OM blast email",
      description:
        "Composes a templated OM-distribution email per buyer tier (Green / Yellow), opens a review screen, then sends via Resend.",
      phase: "phase_2",
    },
  ],
  "request in-person meeting with top (green) buyers": [
    {
      kind: "send-email",
      label: "Email Green buyers",
      feature: "In-person meeting request",
      description:
        "Drafts a templated meeting-request email to all Green-tier buyers on this deal.",
      phase: "phase_2",
    },
  ],
  "send out q&a file": [
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
  "share market study": [
    {
      kind: "send-email",
      label: "Send to buyers",
      feature: "Market Study distribution",
      description: "Emails the uploaded Market Study to all buyers on this deal via Resend.",
      phase: "phase_2",
    },
  ],
  "email notification of offers due (x days before)": [
    {
      kind: "schedule-reminder",
      label: "Schedule reminders",
      feature: "Offers-due reminder schedule",
      description:
        "Schedules templated reminder emails: X days before offer deadline, day-of, and day-after follow-up to Green/Yellow buyers without offers.",
      phase: "phase_2",
    },
  ],
  "day-of reminder": [
    {
      kind: "send-email",
      label: "Send now",
      feature: "Day-of offers-due reminder",
      description: "Sends the day-of offers-due reminder to all buyers on this deal.",
      phase: "phase_2",
    },
  ],
  "automated follow-up to green & yellow buyers whose offers haven't come in":
    [
      {
        kind: "send-email",
        label: "Send follow-up",
        feature: "Follow-up email to non-responders",
        description:
          "Drafts a templated follow-up to Green/Yellow buyers who have OM Sent but no offer received yet.",
        phase: "phase_2",
      },
    ],

  // --- Phase 3 items (ownership summary) ---
  "schedule meeting with ownership": [
    {
      kind: "send-email",
      label: "Send invite",
      feature: "Ownership meeting invite",
      description: "Drafts a meeting-invite email to the Owner Team for this deal.",
      phase: "phase_2",
    },
  ],
  "create initial summary (send out as received)": [
    {
      kind: "send-email",
      label: "Email Owner Team",
      feature: "Initial offer summary",
      description: "Drafts a summary email to Owner Team listing offers received to date.",
      phase: "phase_2",
    },
  ],
  "pdf everything together": [
    {
      kind: "generate-doc",
      label: "Compile package",
      feature: "Compiled offer package PDF",
      description:
        "Merges the SOO matrix, underwriting summaries, revenue charts, and supporting docs into a single PDF for ownership review.",
      phase: "phase_2",
    },
  ],

  // --- Phase 4 items (deal management) ---
  "share all due diligence": [
    {
      kind: "send-email",
      label: "Email DD links",
      feature: "Due Diligence distribution",
      description:
        "Composes an email to the selected Buyer Team with links to all DD documents on this deal.",
      phase: "phase_2",
    },
  ],
  "kick off psa": [
    {
      kind: "send-email",
      label: "Notify PSA Attorney",
      feature: "PSA kickoff email",
      description: "Drafts a kickoff email to the chosen PSA Attorney for this deal.",
      phase: "phase_2",
    },
  ],
  "kickoff call": [
    {
      kind: "send-email",
      label: "Send invite",
      feature: "Kickoff call invite",
      description: "Drafts a calendar invite email to the Buyer Team and Owner Team.",
      phase: "phase_2",
    },
  ],
  "bi-weekly meeting schedule for dd": [
    {
      kind: "schedule-reminder",
      label: "Schedule meetings",
      feature: "Bi-weekly DD recurring meetings",
      description: "Schedules a recurring bi-weekly DD meeting reminder for this deal.",
      phase: "phase_2",
    },
  ],
};

export function getPlannedActionsForItem(name: string): PlannedItemAction[] {
  return EXACT[name.trim().toLowerCase()] ?? [];
}
