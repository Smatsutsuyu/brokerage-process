"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  Pencil,
  Trash2,
  User,
} from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { deleteBuilder, type Classification } from "./actions";
import { BuilderModal, type EditingBuilder } from "./builder-modal";

export type BuilderRow = {
  id: string;
  name: string;
  classification: Classification;
  notes: string | null;
  contacts: Array<{
    id: string;
    fullName: string;
    title: string | null;
    email: string | null;
  }>;
  deals: Array<{ id: string; name: string }>;
};

type FilterValue = "all" | "private" | "public" | "developer";

const FILTER_LABEL: Record<FilterValue, string> = {
  all: "All",
  private: "Private",
  public: "Public",
  developer: "Developer",
};

type SortColumn = "name" | "classification" | "contacts" | "deals";
type SortDirection = "asc" | "desc";

function comparatorFor(column: SortColumn): (a: BuilderRow, b: BuilderRow) => number {
  switch (column) {
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "classification":
      return (a, b) => a.classification.localeCompare(b.classification);
    case "contacts":
      return (a, b) => a.contacts.length - b.contacts.length;
    case "deals":
      return (a, b) => a.deals.length - b.deals.length;
  }
}

type BuildersListProps = {
  builders: BuilderRow[];
};

const CLASSIFICATION_BADGE: Record<Classification, string> = {
  private: "bg-purple-100 text-purple-800",
  public: "bg-sky-100 text-sky-800",
  developer: "bg-emerald-100 text-emerald-800",
};

export function BuildersList({ builders }: BuildersListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortBy, setSortBy] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditingBuilder | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const counts = useMemo(() => {
    return {
      all: builders.length,
      private: builders.filter((b) => b.classification === "private").length,
      public: builders.filter((b) => b.classification === "public").length,
      developer: builders.filter((b) => b.classification === "developer").length,
    } satisfies Record<FilterValue, number>;
  }, [builders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = builders.filter((b) => {
      if (filter !== "all" && b.classification !== filter) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.contacts.some((c) => c.fullName.toLowerCase().includes(q)) ||
        b.deals.some((d) => d.name.toLowerCase().includes(q))
      );
    });
    const sorted = [...filtered].sort(comparatorFor(sortBy));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [builders, search, filter, sortBy, sortDir]);

  async function handleDelete(b: BuilderRow) {
    if (b.deals.length > 0) {
      await confirm({
        title: "Can't delete this builder",
        description: `${b.name} is on ${b.deals.length} deal(s): ${b.deals.map((d) => d.name).join(", ")}. Remove from those deals first, then delete.`,
        confirmLabel: "OK",
        variant: "default",
      });
      return;
    }
    const ok = await confirm({
      title: "Delete builder?",
      description: `${b.name} will be removed permanently.${
        b.contacts.length > 0
          ? ` ${b.contacts.length} contact(s) at this builder will become standalone (kept, but no builder assigned).`
          : ""
      }`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteBuilder(b.id);
      } catch (err) {
        await confirm({
          title: "Delete failed",
          description: err instanceof Error ? err.message : "Could not delete builder.",
          confirmLabel: "OK",
          variant: "default",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink bg-brand-ink px-3.5 py-1.5 text-xs font-semibold text-white">
            {FILTER_LABEL[filter]}
            <span className="text-[10px] tabular-nums opacity-70">({counts[filter]})</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {(["all", "private", "public", "developer"] satisfies FilterValue[]).map((value) => {
              const isCurrent = value === filter;
              return (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setFilter(value)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span className="flex-1">{FILTER_LABEL[value]}</span>
                  <span className="text-[11px] tabular-nums text-gray-500">{counts[value]}</span>
                  {isCurrent && <Check className="h-3.5 w-3.5 text-gray-400" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, deal…"
          className="ml-auto max-w-xs"
        />

        <Button size="sm" onClick={() => setAddOpen(true)}>
          + Add Builder
        </Button>
      </div>

      <BuilderModal open={addOpen} onOpenChange={setAddOpen} />
      <BuilderModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        editing={editing ?? undefined}
      />

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            {builders.length === 0
              ? "No builders yet. Add one to get started."
              : "No builders match this filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
                <th className="w-[1%] px-2 py-2.5"></th>
                <SortHeader column="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Name
                </SortHeader>
                <SortHeader
                  column="classification"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                >
                  Classification
                </SortHeader>
                <SortHeader
                  column="contacts"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="text-center"
                >
                  Contacts
                </SortHeader>
                <SortHeader
                  column="deals"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="text-center"
                >
                  Deals
                </SortHeader>
                <th className="w-[1%] px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const isOpen = expanded.has(b.id);
                const hasDetail = b.contacts.length > 0 || b.deals.length > 0;
                return (
                  <Fragment key={b.id}>
                    <tr
                      className={cn(
                        "group border-b border-gray-100 hover:bg-gray-50",
                        isOpen && "bg-gray-50",
                      )}
                    >
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpanded(b.id)}
                          disabled={!hasDetail}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          title={
                            hasDetail
                              ? `${b.contacts.length} contact(s), ${b.deals.length} deal(s)`
                              : "No contacts or deals"
                          }
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded transition-colors",
                            hasDetail
                              ? "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                              : "text-gray-200 cursor-default",
                          )}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{b.name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
                            CLASSIFICATION_BADGE[b.classification],
                          )}
                        >
                          {b.classification}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">
                        {b.contacts.length > 0 ? (
                          b.contacts.length
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">
                        {b.deals.length > 0 ? (
                          b.deals.length
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                builderId: b.id,
                                name: b.name,
                                classification: b.classification,
                                notes: b.notes,
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(b)}
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title={
                              b.deals.length > 0
                                ? `Can't delete — on ${b.deals.length} deal(s)`
                                : "Delete"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <td colSpan={6} className="px-4 py-4 pl-12">
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Contacts at this builder */}
                            <div>
                              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                                <User className="h-3 w-3" />
                                {b.contacts.length} contact{b.contacts.length === 1 ? "" : "s"}
                              </div>
                              {b.contacts.length === 0 ? (
                                <div className="text-xs text-gray-400 italic">
                                  No contacts at this builder yet.
                                </div>
                              ) : (
                                <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
                                  {b.contacts.map((c) => (
                                    <li
                                      key={c.id}
                                      className="flex items-center gap-3 px-3 py-2"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="truncate text-[12px] font-medium text-gray-900">
                                          {c.fullName}
                                        </div>
                                        {c.title && (
                                          <div className="truncate text-[11px] text-gray-500">
                                            {c.title}
                                          </div>
                                        )}
                                      </div>
                                      {c.email && (
                                        <a
                                          href={`mailto:${c.email}`}
                                          className="hover:text-brand-blue inline-flex items-center gap-1 text-[11px] text-gray-600"
                                        >
                                          <Mail className="h-3 w-3" />
                                          {c.email}
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Deals this builder is on */}
                            <div>
                              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                                <Briefcase className="h-3 w-3" />
                                On {b.deals.length} deal{b.deals.length === 1 ? "" : "s"}
                              </div>
                              {b.deals.length === 0 ? (
                                <div className="text-xs text-gray-400 italic">
                                  Not on any deals.
                                </div>
                              ) : (
                                <ul className="flex flex-wrap gap-2">
                                  {b.deals.map((d) => (
                                    <li key={d.id}>
                                      <Link
                                        href={`/deals/${d.id}?tab=contacts`}
                                        className="hover:border-brand-blue hover:text-brand-blue inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition-colors"
                                      >
                                        {d.name}
                                        <ArrowRight className="h-3 w-3 opacity-60" />
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          {b.notes && (
                            <div className="mt-3 rounded border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-700">
                              <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                                Notes
                              </div>
                              {b.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
    <th className={cn("px-4 py-2.5 text-left", className)}>
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
