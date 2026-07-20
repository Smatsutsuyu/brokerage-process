"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { addIssue, updateIssue, type IssuePriority, type IssueStatus } from "../actions";

import type { AssigneeOption } from "./issues-list";

export type EditingIssue = {
  issueId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeTeamMemberId: string | null;
  identifiedAt: string;
};

type AddIssueModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  assignees: AssigneeOption[];
  editing?: EditingIssue;
};

const NO_ASSIGNEE = "__none__";

// Header labels for each Deal Team sub-team group in the assignee
// dropdown. Mirrors the CC picker's grouping in the email composer.
const TEAM_LABEL: Record<"owner" | "broker" | "buyer" | "_other", string> = {
  owner: "Owner Team",
  broker: "Broker Team",
  buyer: "Buyer Team",
  _other: "Other",
};
const TEAM_ORDER: ReadonlyArray<"owner" | "broker" | "buyer" | "_other"> = [
  "owner",
  "broker",
  "buyer",
  "_other",
];

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddIssueModal({
  open,
  onOpenChange,
  dealId,
  assignees,
  editing,
}: AddIssueModalProps) {
  const isEdit = Boolean(editing);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<IssueStatus>(editing?.status ?? "open");
  const [priority, setPriority] = useState<IssuePriority>(editing?.priority ?? "medium");
  const [assigneeTeamMemberId, setAssigneeTeamMemberId] = useState<string>(
    editing?.assigneeTeamMemberId ?? NO_ASSIGNEE,
  );
  const [identifiedAt, setIdentifiedAt] = useState<string>(
    editing?.identifiedAt ? editing.identifiedAt.slice(0, 10) : todayISO(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Bucket assignees by sub-team so the dropdown can render section
  // headers (Owner Team / Broker Team / Buyer Team, then Other for any
  // straggler assignees who've been removed from the roster). Iteration
  // order preserved from the parent's sort (team first, then name).
  const groupedAssignees = useMemo(() => {
    const buckets = new Map<"owner" | "broker" | "buyer" | "_other", AssigneeOption[]>();
    for (const a of assignees) {
      const key = a.team ?? "_other";
      let arr = buckets.get(key);
      if (!arr) {
        arr = [];
        buckets.set(key, arr);
      }
      arr.push(a);
    }
    return TEAM_ORDER.map((k) => [k, buckets.get(k) ?? []] as const).filter(
      ([, items]) => items.length > 0,
    );
  }, [assignees]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setError(null);
        if (!editing) {
          setTitle("");
          setDescription("");
          setStatus("open");
          setPriority("medium");
          setAssigneeTeamMemberId(NO_ASSIGNEE);
          setIdentifiedAt(todayISO());
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setStatus(editing?.status ?? "open");
    setPriority(editing?.priority ?? "medium");
    setAssigneeTeamMemberId(editing?.assigneeTeamMemberId ?? NO_ASSIGNEE);
    setIdentifiedAt(editing?.identifiedAt ? editing.identifiedAt.slice(0, 10) : todayISO());
    setError(null);
  }, [open, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    const identifiedDate = identifiedAt ? new Date(identifiedAt) : null;
    const assigned = assigneeTeamMemberId === NO_ASSIGNEE ? null : assigneeTeamMemberId;

    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateIssue({
            dealId,
            issueId: editing.issueId,
            title,
            description,
            status,
            priority,
            assigneeTeamMemberId: assigned,
            identifiedAt: identifiedDate,
          });
        } else {
          await addIssue({
            dealId,
            title,
            description,
            status,
            priority,
            assigneeTeamMemberId: assigned,
            identifiedAt: identifiedDate,
          });
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save issue.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Issue" : "Add Issue"}</DialogTitle>
          <DialogDescription>
            Track a blocker, open question, or follow-up tied to this deal.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-issue-title">Title</Label>
            <Input
              id="add-issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Soils report needs amendment"
              autoFocus
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-issue-desc" className="text-gray-600">
              Description <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="add-issue-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-issue-status">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as IssueStatus)}>
                <SelectTrigger id="add-issue-status">
                  <SelectValue>{STATUS_LABEL[status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-issue-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => v && setPriority(v as IssuePriority)}
              >
                <SelectTrigger id="add-issue-priority">
                  <SelectValue>{PRIORITY_LABEL[priority]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-issue-assignee">Assigned to</Label>
              <Select
                value={assigneeTeamMemberId}
                onValueChange={(v) => setAssigneeTeamMemberId(v ?? NO_ASSIGNEE)}
              >
                <SelectTrigger id="add-issue-assignee">
                  <SelectValue>
                    {assigneeTeamMemberId === NO_ASSIGNEE
                      ? "Unassigned"
                      : (assignees.find((a) => a.id === assigneeTeamMemberId)?.name ??
                        "Unassigned")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
                  {groupedAssignees.map(([groupKey, items]) => (
                    <Fragment key={groupKey}>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          {TEAM_LABEL[groupKey]}
                        </SelectLabel>
                        {items.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-issue-date">Date identified</Label>
              <Input
                id="add-issue-date"
                type="date"
                value={identifiedAt}
                onChange={(e) => setIdentifiedAt(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Save Issue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
