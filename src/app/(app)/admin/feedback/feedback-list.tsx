"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Save,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { deleteFeedback, setFeedbackResponse, setFeedbackStatus } from "./actions";

type FeedbackStatus = "new" | "reviewed" | "actioned" | "complete" | "wontfix";
type FeedbackSeverity = "nit" | "suggestion" | "bug" | "blocker";

export type FeedbackRow = {
  id: string;
  section: string;
  pagePath: string;
  commitSha: string | null;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  comment: string;
  response: string | null;
  userEmail: string | null;
  createdAt: string;
  reviewedAt: string | null;
  actionedAt: string | null;
};

type StatusFilter = FeedbackStatus | "all" | "open";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  open: "Open (new + reviewed + actioned)",
  new: "New",
  reviewed: "Reviewed",
  actioned: "Actioned",
  complete: "Complete",
  wontfix: "Won't fix",
};

const STATUS_META: Record<
  FeedbackStatus,
  { label: string; chip: string; dot: string }
> = {
  new: { label: "New", chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  reviewed: { label: "Reviewed", chip: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  actioned: { label: "Actioned", chip: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-500" },
  complete: { label: "Complete", chip: "bg-green-100 text-green-800", dot: "bg-green-500" },
  wontfix: { label: "Won't fix", chip: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
};

const SEVERITY_META: Record<
  FeedbackSeverity,
  { label: string; chip: string; rank: number }
> = {
  blocker: { label: "Blocker", chip: "bg-red-100 text-red-800", rank: 0 },
  bug: { label: "Bug", chip: "bg-orange-100 text-orange-800", rank: 1 },
  suggestion: { label: "Suggestion", chip: "bg-blue-100 text-blue-800", rank: 2 },
  nit: { label: "Nit", chip: "bg-gray-100 text-gray-700", rank: 3 },
};

const STATUS_ORDER: FeedbackStatus[] = ["new", "reviewed", "actioned", "complete", "wontfix"];
const FILTER_ORDER: StatusFilter[] = ["all", "open", ...STATUS_ORDER];

// "Open" = anything not in a terminal state. Actioned items aren't terminal:
// they're awaiting Chris's sign-off (→ complete) or pushback (→ reviewed).
function isOpen(status: FeedbackStatus): boolean {
  return status === "new" || status === "reviewed" || status === "actioned";
}

type SortColumn = "created" | "severity" | "section" | "status";
type SortDirection = "asc" | "desc";

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FeedbackListProps = {
  items: FeedbackRow[];
};

export function FeedbackList({ items }: FeedbackListProps) {
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortColumn>("created");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      // Smart defaults: created desc (newest first), everything else asc.
      setSortDir(column === "created" ? "desc" : "asc");
    }
  }

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: items.length,
      open: 0,
      new: 0,
      reviewed: 0,
      actioned: 0,
      complete: 0,
      wontfix: 0,
    };
    for (const it of items) c[it.status]++;
    c.open = c.new + c.reviewed + c.actioned;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (filter === "open" && !isOpen(it.status)) return false;
      if (filter !== "all" && filter !== "open" && it.status !== filter) return false;
      if (!q) return true;
      return (
        it.comment.toLowerCase().includes(q) ||
        it.section.toLowerCase().includes(q) ||
        (it.response?.toLowerCase().includes(q) ?? false) ||
        (it.userEmail?.toLowerCase().includes(q) ?? false) ||
        it.pagePath.toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "created":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "severity":
          return SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
        case "section":
          return a.section.localeCompare(b.section);
        case "status":
          return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      }
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [items, filter, search, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink bg-brand-ink px-3.5 py-1.5 text-xs font-semibold text-white">
            {STATUS_FILTER_LABEL[filter]}
            <span className="text-[10px] tabular-nums opacity-70">({counts[filter]})</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {FILTER_ORDER.map((value) => {
              const isCurrent = value === filter;
              return (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setFilter(value)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span className="flex-1">{STATUS_FILTER_LABEL[value]}</span>
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
          placeholder="Search comment, section, page, response…"
          className="ml-auto max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            {items.length === 0
              ? "No feedback submitted yet."
              : "No items match this filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
                <th className="w-[1%] px-2 py-2.5"></th>
                <SortHeader column="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>
                  Status
                </SortHeader>
                <SortHeader
                  column="severity"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                >
                  Severity
                </SortHeader>
                <SortHeader
                  column="section"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                >
                  Section
                </SortHeader>
                <th className="px-4 py-2.5 text-left">Comment</th>
                <SortHeader
                  column="created"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="text-right"
                >
                  Submitted
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <FeedbackRowView
                  key={it.id}
                  item={it}
                  expanded={expanded.has(it.id)}
                  onToggle={() => toggleExpanded(it.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type FeedbackRowViewProps = {
  item: FeedbackRow;
  expanded: boolean;
  onToggle: () => void;
};

function FeedbackRowView({ item, expanded, onToggle }: FeedbackRowViewProps) {
  const status = STATUS_META[item.status];
  const severity = SEVERITY_META[item.severity];
  const [statusPending, startStatus] = useTransition();
  const [responsePending, startResponse] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [response, setResponse] = useState(item.response ?? "");
  const [responseDirty, setResponseDirty] = useState(false);
  const confirm = useConfirm();

  function handleStatus(next: FeedbackStatus) {
    if (next === item.status) return;
    startStatus(async () => {
      await setFeedbackStatus({ feedbackId: item.id, status: next });
    });
  }

  function handleSaveResponse() {
    startResponse(async () => {
      await setFeedbackResponse({ feedbackId: item.id, response });
      setResponseDirty(false);
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this feedback?",
      description:
        "Permanently removes the item and any response. Use this for spam or duplicates — for triaged work, set status to Won't fix instead.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteFeedback(item.id);
    });
  }

  return (
    <Fragment>
      <tr className={cn("border-b border-gray-100 hover:bg-gray-50", expanded && "bg-gray-50")}>
        <td className="px-2 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </td>
        <td className="px-4 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={statusPending}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-opacity",
                status.chip,
                statusPending && "opacity-60",
              )}
            >
              {statusPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
              )}
              {status.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {STATUS_ORDER.map((s) => {
                const meta = STATUS_META[s];
                const isCurrent = s === item.status;
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => handleStatus(s)}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    <span className="flex-1">{meta.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-gray-400" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
              severity.chip,
            )}
          >
            {severity.label}
          </span>
        </td>
        <td className="px-4 py-2.5 font-medium text-gray-700">{item.section}</td>
        <td className="px-4 py-2.5 text-gray-600">
          <div className="line-clamp-2 max-w-md">{item.comment}</div>
          {item.response && !expanded && (
            <div className="mt-0.5 text-[11px] text-blue-600">↳ has response</div>
          )}
        </td>
        <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap text-gray-500">
          <span title={new Date(item.createdAt).toLocaleString()}>{relTime(item.createdAt)}</span>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <td colSpan={6} className="px-4 py-4 pl-12">
            <div className="space-y-4">
              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-500">
                <span>
                  <span className="font-semibold text-gray-700">From:</span>{" "}
                  {item.userEmail ?? "(unknown)"}
                </span>
                <span>
                  <span className="font-semibold text-gray-700">Page:</span>{" "}
                  <Link
                    href={item.pagePath}
                    className="hover:text-brand-blue inline-flex items-center gap-1 text-gray-700"
                  >
                    <code className="text-[10px]">{item.pagePath}</code>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </span>
                {item.commitSha && (
                  <span>
                    <span className="font-semibold text-gray-700">Build:</span>{" "}
                    <code className="text-[10px]">{item.commitSha.slice(0, 7)}</code>
                  </span>
                )}
                <span>
                  <span className="font-semibold text-gray-700">Submitted:</span>{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </span>
                {item.reviewedAt && (
                  <span>
                    <span className="font-semibold text-gray-700">Reviewed:</span>{" "}
                    {new Date(item.reviewedAt).toLocaleString()}
                  </span>
                )}
                {item.actionedAt && (
                  <span>
                    <span className="font-semibold text-gray-700">Actioned:</span>{" "}
                    {new Date(item.actionedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Full comment */}
              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                  Original feedback
                </div>
                <div className="text-[13px] whitespace-pre-wrap text-gray-700">
                  {item.comment}
                </div>
              </div>

              {/* Response editor */}
              <div className="rounded border border-blue-200 bg-blue-50/30 px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
                    Response / working notes
                  </div>
                  {responseDirty && (
                    <span className="text-[10px] text-amber-700">unsaved changes</span>
                  )}
                </div>
                <Textarea
                  value={response}
                  onChange={(e) => {
                    setResponse(e.target.value);
                    setResponseDirty(e.target.value !== (item.response ?? ""));
                  }}
                  rows={3}
                  placeholder="Add a reply, link to a fix, or notes for yourself…"
                  className="bg-white"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveResponse}
                    disabled={responsePending || !responseDirty}
                  >
                    {responsePending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save response
                  </Button>
                </div>
              </div>

              {/* Danger zone */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deletePending}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  {deletePending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
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
