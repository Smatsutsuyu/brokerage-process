"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Link as LinkIcon,
  Mail,
  Upload,
} from "lucide-react";

import { PlannedAction } from "@/components/planned-action";
import { cn } from "@/lib/utils";

import { ChecklistCheckbox } from "./checklist-checkbox";
import { getPlannedActionsForItem, type ItemActionKind } from "./planned-item-actions";

const KIND_ICON: Record<ItemActionKind, typeof FileText> = {
  "send-email": Mail,
  "generate-doc": FileText,
  "generate-xlsx": FileSpreadsheet,
  "schedule-reminder": CalendarClock,
};

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
                  catItems.map((item) => {
                    const itemActions = getPlannedActionsForItem(item.name);
                    return (
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

                        {/* Planned actions stay visible at all times — kept
                            light/muted so they don't compete with the item
                            name, but no floaty hover-reveal that makes other
                            rows feel half-rendered. Item-specific actions
                            (Generate / Send) render first, then the universal
                            Upload + Link Dropbox affordances. */}
                        <div className="flex items-center gap-0.5">
                          {itemActions.map((a) => (
                            <PlannedAction
                              key={a.label}
                              compact
                              feature={a.feature}
                              description={a.description}
                              phase={a.phase}
                              label={a.label}
                              icon={KIND_ICON[a.kind]}
                            />
                          ))}
                          <PlannedAction
                            compact
                            feature="Upload document"
                            description="Uploads a file to Cloudflare R2 storage and attaches it to this checklist item. Supports versioning — every save creates a new version."
                            phase="phase_2"
                            label="Upload"
                            icon={Upload}
                          />
                          <PlannedAction
                            compact
                            feature="Link Dropbox folder"
                            description="Pastes a Dropbox folder URL to associate with this checklist item — no file replication, just a direct link."
                            phase="phase_2"
                            label="Link"
                            icon={LinkIcon}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
