"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  Upload,
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
import { builderChipClass } from "@/lib/builder-color";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { deleteContact } from "./actions";
import { ContactModal, type BuilderOption, type EditingContact } from "./contact-modal";
import { ImportModal } from "./import-modal";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  geography: string | null;
  notes: string | null;
  builderId: string | null;
  builderName: string | null;
  builderClassification: "private" | "public" | "developer" | null;
  // Deals the contact's builder is on. Empty for standalone contacts (no
  // builder) since the deal association flows builder → deal.
  deals: Array<{ id: string; name: string }>;
};

type FilterValue = "all" | "with-builder" | "standalone";

const FILTER_LABEL: Record<FilterValue, string> = {
  all: "All",
  "with-builder": "With builder",
  standalone: "Standalone",
};

type SortColumn = "name" | "builder" | "title" | "email" | "phone" | "geography";
type SortDirection = "asc" | "desc";

// Nulls/empties sort last regardless of direction. Standard "missing data
// at the bottom" pattern users expect from a directory.
function cmpText(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function comparatorFor(column: SortColumn): (a: ContactRow, b: ContactRow) => number {
  switch (column) {
    case "name":
      // Last name first, then first name — standard people-list ordering.
      return (a, b) =>
        cmpText(a.lastName || null, b.lastName || null) ||
        cmpText(a.firstName || null, b.firstName || null);
    case "builder":
      return (a, b) => cmpText(a.builderName, b.builderName);
    case "title":
      return (a, b) => cmpText(a.title, b.title);
    case "email":
      return (a, b) => cmpText(a.email, b.email);
    case "phone":
      return (a, b) => cmpText(a.phone, b.phone);
    case "geography":
      return (a, b) => cmpText(a.geography, b.geography);
  }
}

type ContactsListProps = {
  contacts: ContactRow[];
  builders: BuilderOption[];
};

export function ContactsList({ contacts, builders }: ContactsListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortBy, setSortBy] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

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
      all: contacts.length,
      "with-builder": contacts.filter((c) => c.builderId !== null).length,
      standalone: contacts.filter((c) => c.builderId === null).length,
    } satisfies Record<FilterValue, number>;
  }, [contacts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = contacts.filter((c) => {
      if (filter === "with-builder" && c.builderId === null) return false;
      if (filter === "standalone" && c.builderId !== null) return false;
      if (!q) return true;
      // Search across the obvious identity + association fields. Cheap on
      // small lists (~200 contacts max per Lakebridge sizing).
      return (
        c.fullName.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.builderName?.toLowerCase().includes(q) ?? false) ||
        (c.title?.toLowerCase().includes(q) ?? false) ||
        (c.geography?.toLowerCase().includes(q) ?? false)
      );
    });
    const sorted = [...filtered].sort(comparatorFor(sortBy));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [contacts, search, filter, sortBy, sortDir]);

  async function handleDelete(c: ContactRow) {
    const ok = await confirm({
      title: "Delete contact?",
      description: `${c.fullName} will be removed permanently.${
        c.deals.length > 0
          ? ` Their builder is on ${c.deals.length} deal(s) — those associations stay intact (only this contact record is deleted).`
          : ""
      }`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteContact(c.id);
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
            {(["all", "with-builder", "standalone"] satisfies FilterValue[]).map((value) => {
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
          placeholder="Search name, email, builder, geography…"
          className="ml-auto max-w-xs"
        />

        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import from Excel
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          + Add Contact
        </Button>
      </div>

      <ContactModal open={addOpen} onOpenChange={setAddOpen} builders={builders} />
      <ContactModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        builders={builders}
        editing={editing ?? undefined}
      />
      <ImportModal open={importOpen} onOpenChange={setImportOpen} builders={builders} />

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            {contacts.length === 0
              ? "No contacts yet. Add one or import from Excel."
              : "No contacts match this filter."}
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
                <SortHeader column="builder" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Builder
                </SortHeader>
                <SortHeader column="title" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Title
                </SortHeader>
                <SortHeader column="email" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Email
                </SortHeader>
                <SortHeader column="phone" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Phone
                </SortHeader>
                <SortHeader
                  column="geography"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                >
                  Geography
                </SortHeader>
                <th className="w-[1%] px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const isOpen = expanded.has(c.id);
                const hasDeals = c.deals.length > 0;
                return (
                  <Fragment key={c.id}>
                    <tr
                      className={cn(
                        "group border-b border-gray-100 hover:bg-gray-50",
                        isOpen && "bg-gray-50",
                      )}
                    >
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => hasDeals && toggleExpanded(c.id)}
                          disabled={!hasDeals}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          title={
                            hasDeals
                              ? `${c.deals.length} deal${c.deals.length === 1 ? "" : "s"}`
                              : "No deals"
                          }
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded transition-colors",
                            hasDeals
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
                      <td className="px-4 py-2.5 font-medium text-gray-900">{c.fullName}</td>
                      <td className="px-4 py-2.5">
                        {c.builderName ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                              builderChipClass(c.builderId),
                            )}
                          >
                            <Building2 className="h-3 w-3 flex-shrink-0 opacity-70" />
                            {c.builderName}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {c.title ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:text-brand-blue inline-flex items-center gap-1"
                          >
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="h-3 w-3" />
                            {formatPhone(c.phone)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {c.geography ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.geography}
                          </span>
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
                                contactId: c.id,
                                builderId: c.builderId,
                                firstName: c.firstName,
                                lastName: c.lastName,
                                title: c.title,
                                email: c.email,
                                phone: c.phone,
                                geography: c.geography,
                                notes: c.notes,
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && hasDeals && (
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <td colSpan={8} className="px-4 py-3 pl-12">
                          <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                            On {c.deals.length} deal{c.deals.length === 1 ? "" : "s"} via {c.builderName}
                          </div>
                          <ul className="flex flex-wrap gap-2">
                            {c.deals.map((d) => (
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
