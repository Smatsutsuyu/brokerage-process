"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Save, Send, Trash2, X } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  addFeedbackComment,
  deleteFeedbackComment,
  editFeedbackComment,
} from "./actions";

export type CommentRow = {
  id: string;
  authorId: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type CommentThreadProps = {
  feedbackId: string;
  comments: CommentRow[];
  // The current user's id and "can moderate any" flag (true for org owners,
  // false for everyone else). Author-of-this-comment can always edit/delete
  // their own; moderators can edit/delete any.
  currentUserId: string | null;
  canModerate: boolean;
};

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

export function CommentThread({
  feedbackId,
  comments,
  currentUserId,
  canModerate,
}: CommentThreadProps) {
  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-[12px] text-gray-500 italic">
          No comments yet. Be the first to reply.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canEdit={canModerate || c.authorId === currentUserId}
            />
          ))}
        </ul>
      )}
      <Composer feedbackId={feedbackId} />
    </div>
  );
}

function CommentItem({ comment, canEdit }: { comment: CommentRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [isPending, startTransition] = useTransition();
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  const edited = comment.updatedAt !== comment.createdAt;

  function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body) {
      setEditing(false);
      setDraft(comment.body);
      return;
    }
    startTransition(async () => {
      await editFeedbackComment({ commentId: comment.id, body: trimmed });
      setEditing(false);
    });
  }

  function handleCancel() {
    setDraft(comment.body);
    setEditing(false);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this comment?",
      description: "Removes this reply from the thread. This can't be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteFeedbackComment(comment.id);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  return (
    <li className="rounded border border-gray-200 bg-white px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-gray-700">
            {comment.authorEmail ?? "(unknown)"}
          </span>
          <span className="text-gray-400" title={new Date(comment.createdAt).toLocaleString()}>
            {relTime(comment.createdAt)}
          </span>
          {edited && (
            <span className="text-gray-400" title={new Date(comment.updatedAt).toLocaleString()}>
              · edited
            </span>
          )}
        </div>
        {canEdit && !editing && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit"
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              title="Delete"
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            autoFocus
            className="text-[13px]"
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <span className="mr-auto text-[10px] text-gray-500">
              ⌘/Ctrl + Enter saves · Esc cancels
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending || !draft.trim() || draft.trim() === comment.body}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        </>
      ) : (
        <p className={cn("text-[13px] whitespace-pre-wrap text-gray-700")}>{comment.body}</p>
      )}
    </li>
  );
}

function Composer({ feedbackId }: { feedbackId: string }) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await addFeedbackComment({ feedbackId, body: trimmed });
      setBody("");
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="rounded border border-blue-200 bg-blue-50/30 px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
        Add a comment
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder="Reply, ask a follow-up, or note progress…"
        className="bg-white"
        disabled={isPending}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[10px] text-gray-500">⌘/Ctrl + Enter to post</span>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Post
        </Button>
      </div>
    </div>
  );
}
