import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type Category = {
  id: string;
  phase: "phase_1" | "phase_2" | "phase_3" | "phase_4";
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
};

type ChecklistViewProps = {
  categories: Category[];
  items: Item[];
};

const PHASE_META: Record<Category["phase"], { label: string; bg: string; chip: string }> = {
  phase_1: { label: "Phase 1", bg: "bg-phase-1", chip: "bg-blue-600" },
  phase_2: { label: "Phase 2", bg: "bg-phase-2", chip: "bg-green-600" },
  phase_3: { label: "Phase 3", bg: "bg-phase-3", chip: "bg-purple-600" },
  phase_4: { label: "Phase 4", bg: "bg-phase-4", chip: "bg-orange-600" },
};

export function ChecklistView({ categories, items }: ChecklistViewProps) {
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

  // Group categories by phase, then items by category.
  const byPhase = new Map<Category["phase"], Category[]>();
  for (const cat of categories) {
    const list = byPhase.get(cat.phase) ?? [];
    list.push(cat);
    byPhase.set(cat.phase, list);
  }
  const itemsByCategory = new Map<string, Item[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
  }

  const phases: Category["phase"][] = ["phase_1", "phase_2", "phase_3", "phase_4"];

  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        const phaseCats = byPhase.get(phase) ?? [];
        if (phaseCats.length === 0) return null;
        const meta = PHASE_META[phase];
        const allItemsInPhase = phaseCats.flatMap((c) => itemsByCategory.get(c.id) ?? []);
        const phaseDone = allItemsInPhase.filter((i) => i.completed).length;
        const phaseTotal = allItemsInPhase.length;

        return (
          <section key={phase} className="overflow-hidden rounded-xl shadow-sm">
            <header
              className={cn(
                "flex items-center justify-between px-5 py-3.5 text-white",
                meta.bg,
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/90 uppercase">
                  {meta.label}
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-white/70">
                  {phaseDone}/{phaseTotal}
                </span>
                <ChevronDown className="h-4 w-4 text-white/60" />
              </div>
            </header>

            <div className="bg-white">
              {phaseCats.map((cat) => {
                const catItems = itemsByCategory.get(cat.id) ?? [];
                return (
                  <div key={cat.id}>
                    <div className="border-y border-gray-100 bg-gray-50 px-5 py-2 text-[11px] font-bold tracking-wider text-gray-600 uppercase">
                      {cat.name}
                    </div>
                    {catItems.length === 0 ? (
                      <div className="px-5 py-3 text-xs text-gray-400 italic">No items</div>
                    ) : (
                      catItems.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0",
                            item.completed && "bg-green-50",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                              item.completed
                                ? "border-green-500 bg-green-500 text-white"
                                : "border-gray-300",
                            )}
                          >
                            {item.completed && <span className="text-[10px] font-bold">✓</span>}
                          </div>
                          <span
                            className={cn(
                              "flex-1 text-[13px] font-normal text-gray-700",
                              item.completed && "text-gray-400 line-through",
                            )}
                          >
                            {item.name}
                          </span>
                          {item.optional && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-amber-800">
                              optional
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
