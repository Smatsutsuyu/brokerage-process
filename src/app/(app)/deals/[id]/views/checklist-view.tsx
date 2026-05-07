import type { AttachedDocument } from "./checklist-document";
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
  externalLinkUrl: string | null;
  externalLinkLabel: string | null;
  notes: string | null;
};

type ChecklistViewProps = {
  dealId: string;
  categories: Category[];
  items: Item[];
  // Latest document attached to each checklist item, keyed by item id.
  // Items with no document are simply absent from the record.
  documentByItemId: Record<string, AttachedDocument>;
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
  documentByItemId,
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
            documentByItemId={documentByItemId}
            psaAttorney={psaAttorney}
          />
        );
      })}
    </div>
  );
}
