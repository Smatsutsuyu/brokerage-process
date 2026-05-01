"use client";

import { useState, useTransition } from "react";
import { Calendar, Loader2, Pencil, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { deleteIssue, type IssuePriority, type IssueStatus } from "../actions";

import { AddIssueModal, type EditingIssue } from "./add-issue-modal";
import { IssueStatusBadge } from "./issue-status-badge";

export type IssueRow = {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignedUserId: string | null;
  assigneeName: string | null;
  identifiedAt: string;
};

export type UserOption = {
  id: string;
  name: string;
};

type IssuesListProps = {
  dealId: string;
  items: IssueRow[];
  users: UserOption[];
};

const PRIORITY_META: Record<IssuePriority, { label: string; badge: string }> = {
  low: { label: "Low", badge: "bg-gray-100 text-gray-600" },
  medium: { label: "Medium", badge: "bg-blue-100 text-blue-700" },
  high: { label: "High", badge: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", badge: "bg-red-100 text-red-700" },
};

const STATUS_BORDER: Record<IssueStatus, string> = {
  open: "border-l-red-500",
  in_progress: "border-l-amber-500",
  resolved: "border-l-green-500 bg-green-50/40",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function IssuesList({ dealId, items, users }: IssuesListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditingIssue | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const open = items.filter((i) => i.status === "open").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const resolved = items.filter((i) => i.status === "resolved").length;

  function handleDelete(id: string) {
    if (!window.confirm("Delete this issue?")) return;
    setDeletingId(id);
    startDelete(async () => {
      await deleteIssue({ dealId, issueId: id });
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Issues
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="font-semibold tabular-nums">{open}</span> open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-semibold tabular-nums">{inProgress}</span> in progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="font-semibold tabular-nums">{resolved}</span> resolved
          </span>
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            + Add Issue
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <h2 className="mb-1 text-base font-semibold text-gray-700">No issues yet</h2>
          <p className="text-sm text-gray-500">
            Track blockers, open questions, and follow-ups here as the deal progresses.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const priority = PRIORITY_META[item.priority];
            const isDeleting = deletingId === item.id;
            return (
              <article
                key={item.id}
                className={cn(
                  "group relative rounded-xl bg-white p-4 shadow-sm",
                  "border-l-[3px]",
                  STATUS_BORDER[item.status],
                  isDeleting && "opacity-50",
                )}
              >
                <header className="mb-2 flex items-center gap-2">
                  <IssueStatusBadge
                    dealId={dealId}
                    issueId={item.id}
                    status={item.status}
                  />
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      priority.badge,
                    )}
                  >
                    {priority.label}
                  </span>
                  <div className="ml-auto flex items-center gap-1 opacity-30 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          issueId: item.id,
                          title: item.title,
                          description: item.description ?? "",
                          status: item.status,
                          priority: item.priority,
                          assignedUserId: item.assignedUserId,
                          identifiedAt: item.identifiedAt,
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                      title="Edit issue"
                      aria-label="Edit issue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isDeleting}
                      className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete issue"
                      aria-label="Delete issue"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </header>
                <h3 className="mb-1 text-sm font-semibold text-gray-900">{item.title}</h3>
                {item.description && (
                  <p className="mb-2 text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                    {item.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                  {item.assigneeName && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.assigneeName}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Identified {formatDate(item.identifiedAt)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AddIssueModal
        open={addOpen}
        onOpenChange={setAddOpen}
        dealId={dealId}
        users={users}
      />
      <AddIssueModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        dealId={dealId}
        users={users}
        editing={editing ?? undefined}
      />
    </div>
  );
}
