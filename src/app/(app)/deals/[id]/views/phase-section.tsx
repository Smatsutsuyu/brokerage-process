"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { ChecklistCheckbox } from "./checklist-checkbox";

type Category = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  categoryId: string;
  name: string;
  optional: boolean;
  completed: boolean;
};

type PhaseSectionProps = {
  dealId: string;
  label: string;
  headerBg: string;
  categories: Category[];
  // Plain record (not Map) so it serializes cleanly across the RSC boundary.
  itemsByCategory: Record<string, Item[]>;
};

export function PhaseSection({
  dealId,
  label,
  headerBg,
  categories,
  itemsByCategory,
}: PhaseSectionProps) {
  const allItems = categories.flatMap((c) => itemsByCategory[c.id] ?? []);
  const done = allItems.filter((i) => i.completed).length;
  const total = allItems.length;
  const allDone = total > 0 && done === total;

  // Auto-collapsed on mount when every item in the phase is already done.
  // After mount, user controls via header click — completing the last item
  // doesn't auto-collapse mid-session (that'd be jarring).
  const [collapsed, setCollapsed] = useState(allDone);

  return (
    <section className="overflow-hidden rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-5 py-3.5 text-left text-white transition-[filter] hover:brightness-110",
          headerBg,
        )}
        aria-expanded={!collapsed}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/90 uppercase">
            {label}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-white/70 tabular-nums">
            {done}/{total}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-white/60 transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {!collapsed && (
        <div className="bg-white">
          {categories.map((cat) => {
            const catItems = itemsByCategory[cat.id] ?? [];
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
                      <ChecklistCheckbox
                        itemId={item.id}
                        dealId={dealId}
                        completed={item.completed}
                      />
                      <span
                        className={cn(
                          "flex-1 text-[13px] font-normal leading-snug text-gray-700",
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
      )}
    </section>
  );
}
