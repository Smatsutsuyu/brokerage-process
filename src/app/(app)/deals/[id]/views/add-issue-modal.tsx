"use client";

import { useEffect, useState, useTransition } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { addIssue, updateIssue, type IssuePriority, type IssueStatus } from "../actions";

import type { UserOption } from "./issues-list";

export type EditingIssue = {
  issueId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignedUserId: string | null;
  identifiedAt: string;
};

type AddIssueModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  users: UserOption[];
  editing?: EditingIssue;
};

const NO_ASSIGNEE = "__none__";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddIssueModal({ open, onOpenChange, dealId, users, editing }: AddIssueModalProps) {
  const isEdit = Boolean(editing);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<IssueStatus>(editing?.status ?? "open");
  const [priority, setPriority] = useState<IssuePriority>(editing?.priority ?? "medium");
  const [assignedUserId, setAssignedUserId] = useState<string>(
    editing?.assignedUserId ?? NO_ASSIGNEE,
  );
  const [identifiedAt, setIdentifiedAt] = useState<string>(
    editing?.identifiedAt ? editing.identifiedAt.slice(0, 10) : todayISO(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          setAssignedUserId(NO_ASSIGNEE);
          setIdentifiedAt(todayISO());
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setStatus(editing?.status ?? "open");
    setPriority(editing?.priority ?? "medium");
    setAssignedUserId(editing?.assignedUserId ?? NO_ASSIGNEE);
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
    const assigned = assignedUserId === NO_ASSIGNEE ? null : assignedUserId;

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
            assignedUserId: assigned,
            identifiedAt: identifiedDate,
          });
        } else {
          await addIssue({
            dealId,
            title,
            description,
            status,
            priority,
            assignedUserId: assigned,
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
                  <SelectValue />
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
                  <SelectValue />
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
                value={assignedUserId}
                onValueChange={(v) => setAssignedUserId(v ?? NO_ASSIGNEE)}
              >
                <SelectTrigger id="add-issue-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
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
