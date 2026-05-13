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
import { ChecklistDate } from "./checklist-date";
import { ChecklistDocument, type AttachedDocument } from "./checklist-document";
import { ChecklistLink, type AttachedLink } from "./checklist-link";
import { ChecklistNotesPanel, ChecklistNotesToggle } from "./checklist-notes";
import {
  getPlannedActionsForItem,
  isItemDateField,
  type ItemActionKind,
} from "@/db/checklist-template";
import { OmBlastButton } from "./om-blast-button";
import { PsaAttorneyInline, type PsaAttorneyState } from "./psa-attorney";

// Lowercased substring match — flexible to wording tweaks ("Determine PSA
// Attorney" vs "PSA Attorney" vs slight variations) without requiring an
// exact name match.
function isPsaAttorneyItem(name: string): boolean {
  return name.toLowerCase().includes("psa attorney");
}

// Same loose-match style as isPsaAttorneyItem so a slight rename of the
// template item ("Send out OM Blast" vs "Send out OM / Blast") doesn't
// silently lose the real button.
function isOmBlastItem(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("send out om") && n.includes("blast");
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
  notes: string | null;
  trackedDate: string | null;
};

type PhaseSectionProps = {
  dealId: string;
  label: string;
  headerBg: string;
  categories: Category[];
  // Plain record (not Map) so it serializes cleanly across the RSC boundary.
  itemsByCategory: Record<string, Item[]>;
  // Many docs allowed per item; newest first. Items with zero docs are
  // simply absent from the record.
  documentsByItemId: Record<string, AttachedDocument[]>;
  // External-link attachments per item, ordered by sortOrder + age.
  linksByItemId: Record<string, AttachedLink[]>;
  psaAttorney: PsaAttorneyState;
  // ID of the "Offering Memorandum" item — passed to the OM-blast button
  // so it can draw a hover-time connector showing where the attached file
  // lives. Null when no OM item exists on this deal.
  omItemId: string | null;
};

export function PhaseSection({
  dealId,
  label,
  headerBg,
  categories,
  itemsByCategory,
  documentsByItemId,
  linksByItemId,
  psaAttorney,
  omItemId,
}: PhaseSectionProps) {
  const allItems = categories.flatMap((c) => itemsByCategory[c.id] ?? []);
  const done = allItems.filter((i) => i.completed).length;
  const total = allItems.length;
  const allDone = total > 0 && done === total;

  // Auto-collapsed on mount when every item in the phase is already done.
  // After mount, user controls via header click — completing the last item
  // doesn't auto-collapse mid-session (that'd be jarring).
  const [collapsed, setCollapsed] = useState(allDone);

  // Notes are hidden by default (per Chris's feedback — the always-visible
  // sub-row read like cluttered sub-bullets). Two state sets:
  //   notesOpen    — items whose panel is currently expanded
  //   notesEditing — items whose textarea is showing (subset of notesOpen)
  // Living at this level (vs. inside each row) keeps the child components
  // oblivious to their position in the layout.
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [notesEditing, setNotesEditing] = useState<Set<string>>(new Set());

  function setItemNotesEditing(itemId: string, next: boolean) {
    setNotesEditing((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(itemId);
      else copy.delete(itemId);
      return copy;
    });
  }

  function closeNotesPanel(itemId: string) {
    setNotesOpen((prev) => {
      if (!prev.has(itemId)) return prev;
      const copy = new Set(prev);
      copy.delete(itemId);
      return copy;
    });
    setItemNotesEditing(itemId, false);
  }

  function toggleNotesPanel(itemId: string, hasNotes: boolean) {
    if (notesOpen.has(itemId)) {
      closeNotesPanel(itemId);
      return;
    }
    setNotesOpen((prev) => new Set(prev).add(itemId));
    // Empty note → jump straight into edit mode so the click feels like
    // "+ Add note" rather than landing on an empty view-mode pane.
    if (!hasNotes) setItemNotesEditing(itemId, true);
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
                    const isNotesOpen = notesOpen.has(item.id);
                    const hasNotes = Boolean(item.notes && item.notes.trim());
                    const docs = documentsByItemId[item.id] ?? [];
                    const links = linksByItemId[item.id] ?? [];
                    // Sub-row only renders when there's at least one
                    // attached doc OR link — otherwise the main row stands
                    // alone.
                    const hasAttachments = docs.length > 0 || links.length > 0;
                    return (
                      <div
                        key={item.id}
                        // Stable DOM id so cross-phase visual connectors
                        // (e.g. the OM-blast button's hover line back to
                        // "Offering Memorandum") can target this row by
                        // getElementById.
                        id={`checklist-item-${item.id}`}
                        className={cn(
                          "border-b border-gray-100 last:border-b-0 transition-shadow",
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
                            {/* Milestone-date chip for items the
                                template flags with dateField: true
                                (Phase 4 CTC / IC / Feasibility /
                                Closing, etc.). Sits ahead of the
                                action buttons so the milestone is
                                visible without scanning past clutter. */}
                            {isItemDateField(item.name) && (
                              <ChecklistDate
                                itemId={item.id}
                                dealId={dealId}
                                value={item.trackedDate}
                              />
                            )}
                            {/* Real action: opens BlastModal → email
                                preview. Replaces the placeholder toasts
                                that used to live on this row. */}
                            {isOmBlastItem(item.name) && (
                              <OmBlastButton
                                dealId={dealId}
                                attachmentSourceItemId={omItemId}
                              />
                            )}
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
                              documents={docs}
                              itemName={item.name}
                              slot="trigger"
                            />
                            <ChecklistLink
                              dealId={dealId}
                              itemId={item.id}
                              links={links}
                              slot="trigger"
                            />
                            {isPsaAttorneyItem(item.name) && (
                              <PsaAttorneyInline dealId={dealId} state={psaAttorney} />
                            )}
                            {/* Notes toggle is always rendered. Dot
                                indicator on the icon flags items that
                                already have a note; click expands the
                                panel below the row. Hidden by default so
                                multi-line notes don't crowd the
                                checklist density. */}
                            <ChecklistNotesToggle
                              hasNotes={hasNotes}
                              open={isNotesOpen}
                              onToggle={() => toggleNotesPanel(item.id, hasNotes)}
                            />
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
                              documents={docs}
                              itemName={item.name}
                              slot="display"
                            />
                            <ChecklistLink
                              dealId={dealId}
                              itemId={item.id}
                              links={links}
                              slot="display"
                            />
                          </div>
                        )}

                        {/* Notes panel only renders when explicitly
                            opened via the toggle button. The panel itself
                            decides between view and edit modes; onClose
                            collapses the panel when the user cancels an
                            empty draft or clears the only existing note. */}
                        {isNotesOpen && (
                          <ChecklistNotesPanel
                            dealId={dealId}
                            itemId={item.id}
                            notes={item.notes}
                            editing={isNotesEditing}
                            onEditingChange={(next) =>
                              setItemNotesEditing(item.id, next)
                            }
                            onClose={() => closeNotesPanel(item.id)}
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
