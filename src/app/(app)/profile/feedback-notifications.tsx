"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";

import { setMyNotificationPreference, type NotificationChannel } from "./actions";

type FeedbackNotificationsProps = {
  initialNotifyOnNewFeedback: boolean;
  initialNotifyOnNewComment: boolean;
  initialNotifyOnReplyToMine: boolean;
  initialNotifyOnStatusChangeToMine: boolean;
};

// Owner-only section: per-channel feedback email subscriptions. The page
// already gates this on me.role === "owner"; the channel server action
// re-enforces owner-only as defense in depth.
export function FeedbackNotifications({
  initialNotifyOnNewFeedback,
  initialNotifyOnNewComment,
  initialNotifyOnReplyToMine,
  initialNotifyOnStatusChangeToMine,
}: FeedbackNotificationsProps) {
  const [newFeedback, setNewFeedback] = useState(initialNotifyOnNewFeedback);
  const [newComment, setNewComment] = useState(initialNotifyOnNewComment);
  const [replyToMine, setReplyToMine] = useState(initialNotifyOnReplyToMine);
  const [statusChangeToMine, setStatusChangeToMine] = useState(
    initialNotifyOnStatusChangeToMine,
  );
  const [pendingNewFeedback, startNewFeedback] = useTransition();
  const [pendingNewComment, startNewComment] = useTransition();
  const [pendingReplyToMine, startReplyToMine] = useTransition();
  const [pendingStatusChange, startStatusChange] = useTransition();

  function handleToggle(
    channel: NotificationChannel,
    next: boolean,
    set: (v: boolean) => void,
    start: ReturnType<typeof useTransition>[1],
  ) {
    set(next);
    start(async () => {
      try {
        await setMyNotificationPreference({ channel, enabled: next });
      } catch (err) {
        set(!next);
        toast.error(err instanceof Error ? err.message : "Couldn't save");
      }
    });
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Bell className="h-3.5 w-3.5 text-gray-500" />
        Feedback notifications
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Email subscriptions for the in-app feedback widget. The first two are opt-in feed
        subscriptions; the last two cover threads you started.
      </p>

      <div className="space-y-2">
        <ToggleRow
          label="New feedback submitted"
          description="Email me every time anyone submits new feedback through the in-app widget."
          checked={newFeedback}
          pending={pendingNewFeedback}
          onToggle={(v) =>
            handleToggle("newFeedback", v, setNewFeedback, startNewFeedback)
          }
        />
        <ToggleRow
          label="Reply on a thread I've commented on"
          description="Email me when someone replies on a feedback thread I've previously commented on."
          checked={newComment}
          pending={pendingNewComment}
          onToggle={(v) => handleToggle("newComment", v, setNewComment, startNewComment)}
        />
        <ToggleRow
          label="Reply on feedback I created"
          description="Email me when someone comments on a feedback I submitted."
          checked={replyToMine}
          pending={pendingReplyToMine}
          onToggle={(v) =>
            handleToggle("replyToMine", v, setReplyToMine, startReplyToMine)
          }
        />
        <ToggleRow
          label="Status change on feedback I created"
          description="Email me when the status moves on a feedback I submitted (e.g. New to Reviewed)."
          checked={statusChangeToMine}
          pending={pendingStatusChange}
          onToggle={(v) =>
            handleToggle(
              "statusChangeToMine",
              v,
              setStatusChangeToMine,
              startStatusChange,
            )
          }
        />
      </div>
    </section>
  );
}

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  pending: boolean;
  onToggle: (next: boolean) => void;
};

function ToggleRow({ label, description, checked, pending, onToggle }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50">
      <Checkbox
        checked={checked}
        onCheckedChange={(state) => onToggle(state === true)}
        disabled={pending}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
    </label>
  );
}
