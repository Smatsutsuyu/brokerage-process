"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Mail,
} from "lucide-react";

import { PlannedAction } from "@/components/planned-action";
import { cn } from "@/lib/utils";

import { ChecklistCheckbox } from "./checklist-checkbox";
import { ChecklistDocument, type AttachedDocument } from "./checklist-document";
import { ChecklistLink } from "./checklist-link";
import { ChecklistNotesAddButton, ChecklistNotesPanel } from "./checklist-notes";
import { getPlannedActionsForItem, type ItemActionKind } from "./planned-item-actions";
import { PsaAttorneyInline, type PsaAttorneyState } from "./psa-attorney";

// Lowercased substring match — flexible to wording tweaks ("Determine PSA
// Attorney" vs "PSA Attorney" vs slight variations) without requiring an
// exact name match.
function isPsaAttorneyItem(name: string): boolean {
  return name.toLowerCase().includes("psa attorney");
}

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
  externalLinkUrl: string | null;
  externalLinkLabel: string | null;
  notes: string | null;
};

type PhaseSectionProps = {
  dealId: string;
  label: string;
  headerBg: string;
  categories: Category[];
  // Plain record (not Map) so it serializes cleanly across the RSC boundary.
  itemsByCategory: Record<string, Item[]>;
  documentByItemId: Record<string, AttachedDocument>;
  psaAttorney: PsaAttorneyState;
};

export function PhaseSection({
  dealId,
  label,
  headerBg,
  categories,
  itemsByCategory,
  documentByItemId,
  psaAttorney,
}: PhaseSectionProps) {
  const allItems = categories.flatMap((c) => itemsByCategory[c.id] ?? []);
  const done = allItems.filter((i) => i.completed).length;
  const total = allItems.length;
  const allDone = total > 0 && done === total;

  // Auto-collapsed on mount when every item in the phase is already done.
  // After mount, user controls via header click — completing the last item
  // doesn't auto-collapse mid-session (that'd be jarring).
  const [collapsed, setCollapsed] = useState(allDone);

  // Set of item ids whose notes are in EDIT mode (textarea visible). When
  // a note exists but isn't being edited, it's shown inline by default —
  // no toggle needed. Living at this level (vs. inside each row) keeps the
  // child component oblivious to its own position in the layout.
  const [notesEditing, setNotesEditing] = useState<Set<string>>(new Set());
  function setItemNotesEditing(itemId: string, next: boolean) {
    setNotesEditing((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(itemId);
      else copy.delete(itemId);
      return copy;
    });
  }

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
                    const isNotesEditing = notesEditing.has(item.id);
                    const hasNotes = Boolean(item.notes && item.notes.trim());
                    const doc = documentByItemId[item.id] ?? null;
                    const link = item.externalLinkUrl
                      ? {
                          url: item.externalLinkUrl,
                          label: item.externalLinkLabel,
                        }
                      : null;
                    // Sub-row only renders when there's an attached doc or
                    // link — otherwise the main row stands alone.
                    const hasAttachments = Boolean(doc || link);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "border-b border-gray-100 last:border-b-0",
                          item.completed && "bg-green-50",
                        )}
                      >
                        <div className="flex items-center gap-3 px-5 py-3">
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

                          {/* Main-row action area: trigger buttons that
                              surface when there's nothing attached yet
                              (Upload, Link). Notes + PSA + planned-action
                              placeholders also live here since they're
                              short-lived chips, not artifacts. */}
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
                            <ChecklistDocument
                              dealId={dealId}
                              checklistItemId={item.id}
                              document={doc}
                              itemName={item.name}
                              slot="trigger"
                            />
                            <ChecklistLink
                              dealId={dealId}
                              itemId={item.id}
                              link={link}
                              slot="trigger"
                            />
                            {isPsaAttorneyItem(item.name) && (
                              <PsaAttorneyInline dealId={dealId} state={psaAttorney} />
                            )}
                            {/* "Add note" only renders when no note exists
                                yet. Once a note is saved it's shown inline
                                below the row, with its own edit/clear
                                affordances. */}
                            {!hasNotes && !isNotesEditing && (
                              <ChecklistNotesAddButton
                                onAdd={() => setItemNotesEditing(item.id, true)}
                              />
                            )}
                          </div>
                        </div>

                        {/* Sub-row: attached artifacts (doc/link chips with
                            always-visible action icons). Only rendered when
                            there's something to show. Indented + subtle
                            background so it reads as part of the parent
                            item rather than a sibling. Fades + slides in on
                            mount so a fresh upload/link feels connected to
                            its trigger button rather than abruptly appearing. */}
                        {hasAttachments && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/40 px-5 py-2 pl-12 animate-in fade-in slide-in-from-top-1 duration-200">
                            <ChecklistDocument
                              dealId={dealId}
                              checklistItemId={item.id}
                              document={doc}
                              itemName={item.name}
                              slot="display"
                            />
                            <ChecklistLink
                              dealId={dealId}
                              itemId={item.id}
                              link={link}
                              slot="display"
                            />
                          </div>
                        )}

                        {/* Notes panel renders whenever a note exists OR
                            we're actively editing one. The panel itself
                            decides between view and edit modes. */}
                        {(hasNotes || isNotesEditing) && (
                          <ChecklistNotesPanel
                            dealId={dealId}
                            itemId={item.id}
                            notes={item.notes}
                            editing={isNotesEditing}
                            onEditingChange={(next) =>
                              setItemNotesEditing(item.id, next)
                            }
                          />
                        )}
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
