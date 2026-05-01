"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Mail, Pencil, Phone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AddBuilderModal } from "./add-builder-modal";
import {
  AddContactModal,
  type BuilderOption,
  type EditingContact,
} from "./add-contact-modal";
import { BuyerCheckbox } from "./buyer-checkbox";
import { DeleteContactDialog } from "./delete-contact-dialog";
import { TierBadge } from "./tier-badge";

type Tier = "green" | "yellow" | "red" | "not_selected";
type FilterValue = Tier | "all";

export type BuyerRow = {
  key: string;
  dealBuyerId: string;
  tier: Tier;
  builderId: string;
  builderName: string;
  builderClassification: "private" | "public";
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactNotes: string | null;
  leadName: string | null;
  omSent: boolean;
  called: boolean;
  comments: string | null;
};

type ContactsTableProps = {
  dealId: string;
  rows: BuyerRow[];
};

const FILTER_META: Record<
  FilterValue,
  { label: string; chip: string; rowBorder: string; dot: string | null }
> = {
  all: {
    label: "All",
    chip: "border-brand-ink bg-brand-ink text-white",
    rowBorder: "",
    dot: null,
  },
  green: {
    label: "Green",
    chip: "bg-green-100 text-green-800 border-green-300",
    rowBorder: "border-l-tier-green",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Yellow",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    rowBorder: "border-l-tier-yellow",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Red",
    chip: "bg-red-100 text-red-800 border-red-300",
    rowBorder: "border-l-tier-red",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    rowBorder: "border-l-gray-300",
    dot: "bg-gray-400",
  },
};

const FILTERS: FilterValue[] = ["all", "green", "yellow", "red", "not_selected"];

const TIER_RANK: Record<Tier, number> = {
  green: 0,
  yellow: 1,
  red: 2,
  not_selected: 3,
};

// Only columns where ordering is meaningful are sortable. Free-text fields
// like Title / Email / Phone / Comments don't sort usefully; omitted by design.
type SortColumn =
  | "interest"
  | "builder"
  | "contact"
  | "type"
  | "lead"
  | "called"
  | "om";

type SortDirection = "asc" | "desc";

// Comparator helpers — nulls/empties always sort last regardless of direction.
function cmpText(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}
function cmpBool(a: boolean, b: boolean): number {
  return Number(a) - Number(b);
}
function cmpTier(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

// Compose "Last, First" for contact sort so last name is primary, first
// name is the tiebreaker. Standard ordering for people lists.
function contactSortKey(r: BuyerRow): string | null {
  if (!r.contactLastName && !r.contactFirstName) return null;
  return `${r.contactLastName ?? ""}, ${r.contactFirstName ?? ""}`;
}

function comparatorFor(column: SortColumn): (a: BuyerRow, b: BuyerRow) => number {
  switch (column) {
    case "interest":
      return (a, b) => cmpTier(a.tier, b.tier);
    case "builder":
      return (a, b) => cmpText(a.builderName, b.builderName);
    case "contact":
      return (a, b) => cmpText(contactSortKey(a), contactSortKey(b));
    case "type":
      return (a, b) => cmpText(a.builderClassification, b.builderClassification);
    case "lead":
      return (a, b) => cmpText(a.leadName, b.leadName);
    case "called":
      return (a, b) => cmpBool(a.called, b.called);
    case "om":
      return (a, b) => cmpBool(a.omSent, b.omSent);
  }
}

export function ContactsTable({ dealId, rows }: ContactsTableProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortBy, setSortBy] = useState<SortColumn>("builder");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addBuilderOpen, setAddBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string | null } | null>(null);

  const builderOptions = useMemo<BuilderOption[]>(() => {
    const map = new Map<string, BuilderOption>();
    for (const r of rows) {
      if (!map.has(r.builderId)) map.set(r.builderId, { id: r.builderId, name: r.builderName });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const tierCounts = useMemo(() => {
    const counts: Record<FilterValue, number> = {
      all: rows.length,
      green: 0,
      yellow: 0,
      red: 0,
      not_selected: 0,
    };
    for (const r of rows) counts[r.tier]++;
    return counts;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = filter === "all" ? rows : rows.filter((r) => r.tier === filter);
    const cmp = comparatorFor(sortBy);
    const sorted = [...filtered].sort(cmp);
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [rows, filter, sortBy, sortDir]);

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <h2 className="mb-1 text-base font-semibold text-gray-700">No buyers on this deal yet</h2>
        <p className="text-sm text-gray-500">Add a builder and contact to start tracking interest.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((value) => {
          const isActive = value === filter;
          const meta = FILTER_META[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? meta.chip
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
              )}
            >
              {meta.dot && <span className={cn("h-2 w-2 rounded-full", meta.dot)} />}
              {meta.label}
              <span className="text-[10px] tabular-nums opacity-70">({tierCounts[value]})</span>
            </button>
          );
        })}

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddBuilderOpen(true)}>
            + Add Builder
          </Button>
          <Button
            size="sm"
            onClick={() => setAddContactOpen(true)}
            disabled={builderOptions.length === 0}
            title={
              builderOptions.length === 0
                ? "Add a builder to the deal first"
                : "Add a contact at an existing builder"
            }
          >
            + Add Contact
          </Button>
        </div>
      </div>

      <AddContactModal
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        dealId={dealId}
        builders={builderOptions}
      />
      <AddContactModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        dealId={dealId}
        builders={builderOptions}
        editing={editing ?? undefined}
      />
      <AddBuilderModal
        open={addBuilderOpen}
        onOpenChange={setAddBuilderOpen}
        dealId={dealId}
      />
      <DeleteContactDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        dealId={dealId}
        contactId={deleting?.id ?? null}
        contactName={deleting?.name ?? null}
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
              <th className="px-3 py-2.5 text-left">#</th>
              <SortHeader column="interest" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                Interest
              </SortHeader>
              <SortHeader column="builder" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                Builder
              </SortHeader>
              <SortHeader column="contact" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                Contact
              </SortHeader>
              <th className="px-3 py-2.5 text-left">Title</th>
              <th className="px-3 py-2.5 text-left">Email</th>
              <th className="px-3 py-2.5 text-left">Phone</th>
              <SortHeader column="type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                Type
              </SortHeader>
              <SortHeader column="lead" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                Lead
              </SortHeader>
              <SortHeader
                column="called"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
                className="text-center"
              >
                Called
              </SortHeader>
              <SortHeader
                column="om"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
                className="text-center"
              >
                OM
              </SortHeader>
              <th className="px-3 py-2.5 text-left">Comments</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-400">
                  No contacts at this level.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, idx) => {
                const meta = FILTER_META[row.tier];
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "group border-b border-gray-100 border-l-[3px] hover:bg-gray-50",
                      meta.rowBorder,
                    )}
                  >
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <TierBadge
                        dealBuyerId={row.dealBuyerId}
                        dealId={dealId}
                        tier={row.tier}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">{row.builderName}</td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {row.contactName ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {row.contactTitle ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {row.contactEmail ? (
                        <a
                          href={`mailto:${row.contactEmail}`}
                          className="hover:text-brand-blue inline-flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          {row.contactEmail}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {row.contactPhone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {row.contactPhone}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] tracking-wider text-gray-500 uppercase">
                      {row.builderClassification}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {row.leadName ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <BuyerCheckbox
                          dealBuyerId={row.dealBuyerId}
                          dealId={dealId}
                          field="called"
                          checked={row.called}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <BuyerCheckbox
                          dealBuyerId={row.dealBuyerId}
                          dealId={dealId}
                          field="omSent"
                          checked={row.omSent}
                        />
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-2.5 text-gray-600">
                      {row.comments ? (
                        <span className="line-clamp-2 text-xs">{row.comments}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {row.contactId && (
                        <div className="flex justify-end gap-1 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                contactId: row.contactId!,
                                builderId: row.builderId,
                                firstName: row.contactFirstName ?? "",
                                lastName: row.contactLastName ?? "",
                                title: row.contactTitle,
                                email: row.contactEmail,
                                phone: row.contactPhone,
                                notes: row.contactNotes,
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            title="Edit contact"
                            aria-label="Edit contact"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleting({ id: row.contactId!, name: row.contactName })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete contact"
                            aria-label="Delete contact"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SortHeaderProps = {
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
  children: React.ReactNode;
};

function SortHeader({ column, sortBy, sortDir, onSort, className, children }: SortHeaderProps) {
  const isActive = sortBy === column;
  return (
    <th className={cn("px-3 py-2.5 text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          isActive ? "text-gray-800" : "hover:text-gray-700",
        )}
      >
        {children}
        {!isActive && <ArrowUpDown className="h-3 w-3 opacity-40" />}
        {isActive && sortDir === "asc" && <ArrowUp className="h-3 w-3" />}
        {isActive && sortDir === "desc" && <ArrowDown className="h-3 w-3" />}
      </button>
    </th>
  );
}
