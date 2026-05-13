import type { AttachedDocument } from "./checklist-document";
import type { AttachedLink } from "./checklist-link";
import { PhaseSection } from "./phase-section";
import type { PsaAttorneyState } from "./psa-attorney";

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

type Category = {
  id: string;
  phase: Phase;
  name: string;
  sortOrder: number;
};

type Item = {
  id: string;
  categoryId: string;
  name: string;
  optional: boolean;
  completed: boolean;
  sortOrder: number;
  notes: string | null;
};

type ChecklistViewProps = {
  dealId: string;
  categories: Category[];
  items: Item[];
  // All documents attached to each checklist item, newest first, keyed
  // by item id. Items with zero docs are simply absent from the record.
  documentsByItemId: Record<string, AttachedDocument[]>;
  // All external-link attachments per item, ordered by sortOrder + age.
  linksByItemId: Record<string, AttachedLink[]>;
  // Deal-level PSA Attorney decision (rendered inline on the
  // "Determine PSA Attorney" row).
  psaAttorney: PsaAttorneyState;
};

const PHASE_META: Record<Phase, { label: string; bg: string }> = {
  phase_1: { label: "Phase 1 — Going to Market", bg: "bg-phase-1" },
  phase_2: { label: "Phase 2 — Marketing Process", bg: "bg-phase-2" },
  phase_3: { label: "Phase 3 — Ownership Summary of Offers", bg: "bg-phase-3" },
  phase_4: { label: "Phase 4 — Deal Management", bg: "bg-phase-4" },
};

const PHASES: Phase[] = ["phase_1", "phase_2", "phase_3", "phase_4"];

export function ChecklistView({
  dealId,
  categories,
  items,
  documentsByItemId,
  linksByItemId,
  psaAttorney,
}: ChecklistViewProps) {
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <h2 className="mb-1 text-base font-semibold text-gray-700">No checklist yet</h2>
        <p className="text-sm text-gray-500">
          Run <code className="rounded bg-gray-100 px-1.5 py-0.5">npm run db:seed</code> to populate
          a sample checklist.
        </p>
      </div>
    );
  }

  const byPhase = new Map<Phase, Category[]>();
  for (const cat of categories) {
    const list = byPhase.get(cat.phase) ?? [];
    list.push(cat);
    byPhase.set(cat.phase, list);
  }
  const itemsByCategory: Record<string, Item[]> = {};
  for (const item of items) {
    (itemsByCategory[item.categoryId] ??= []).push(item);
  }

  // Identify the "Offering Memorandum" item once so the OM-blast button
  // (in Phase 2) can draw a visual connector to it (in Phase 1) on hover.
  // Match by name with the same loose-substring style used elsewhere so
  // a slight rename doesn't silently break the connector.
  const omItemId =
    items.find((i) => i.name.toLowerCase().includes("offering memorandum"))?.id ?? null;

  return (
    <div className="space-y-6">
      {PHASES.map((phase) => {
        const phaseCats = byPhase.get(phase) ?? [];
        if (phaseCats.length === 0) return null;
        const meta = PHASE_META[phase];
        return (
          <PhaseSection
            key={phase}
            dealId={dealId}
            label={meta.label}
            headerBg={meta.bg}
            categories={phaseCats.map((c) => ({ id: c.id, name: c.name }))}
            itemsByCategory={itemsByCategory}
            documentsByItemId={documentsByItemId}
            linksByItemId={linksByItemId}
            psaAttorney={psaAttorney}
            omItemId={omItemId}
          />
        );
      })}
    </div>
  );
}
