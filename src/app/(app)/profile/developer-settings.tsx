"use client";

import { useState, useTransition } from "react";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  setMyDeveloperMode,
  setMyNotificationPreference,
  type NotificationChannel,
} from "./actions";

type DeveloperSettingsProps = {
  initialIsDeveloper: boolean;
  initialNotifyOnNewFeedback: boolean;
  initialNotifyOnNewComment: boolean;
};

// Owner-only settings: developer-mode flag + per-channel notification
// preferences. Page-level conditional already gates this on me.role ===
// "owner"; everything inside is owner-already.
export function DeveloperSettings({
  initialIsDeveloper,
  initialNotifyOnNewFeedback,
  initialNotifyOnNewComment,
}: DeveloperSettingsProps) {
  // Local state for instant feedback — server actions revalidate /profile
  // on success which re-syncs us with truth on the next render.
  const [isDeveloper, setIsDeveloper] = useState(initialIsDeveloper);
  const [notifyFeedback, setNotifyFeedback] = useState(initialNotifyOnNewFeedback);
  const [notifyComment, setNotifyComment] = useState(initialNotifyOnNewComment);
  const [devModePending, startDevMode] = useTransition();
  const [feedbackPending, startFeedback] = useTransition();
  const [commentPending, startComment] = useTransition();

  function handleDevModeToggle(next: boolean) {
    setIsDeveloper(next); // optimistic
    startDevMode(async () => {
      try {
        await setMyDeveloperMode(next);
      } catch (err) {
        setIsDeveloper(!next);
        toast.error(err instanceof Error ? err.message : "Couldn't save");
      }
    });
  }

  function handleChannelToggle(
    channel: NotificationChannel,
    next: boolean,
    set: (v: boolean) => void,
    start: ReturnType<typeof useTransition>[1],
  ) {
    set(next); // optimistic
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
        <Wrench className="h-3.5 w-3.5 text-gray-500" />
        Developer mode
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Enables dev-team email notifications when feedback or comments are posted. Toggle off
        when you&rsquo;re not on duty.
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50">
        <Checkbox
          checked={isDeveloper}
          onCheckedChange={(state) => handleDevModeToggle(state === true)}
          disabled={devModePending}
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-800">I&rsquo;m a developer</div>
          <div className="text-xs text-gray-500">
            Routes new-feedback and new-comment notifications to your account.
          </div>
        </div>
        {devModePending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      </label>

      <div
        className={cn(
          "mt-4 space-y-2 transition-opacity",
          !isDeveloper && "pointer-events-none opacity-50",
        )}
      >
        <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
          Notifications
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50">
          <Checkbox
            checked={notifyFeedback}
            onCheckedChange={(state) =>
              handleChannelToggle("newFeedback", state === true, setNotifyFeedback, startFeedback)
            }
            disabled={!isDeveloper || feedbackPending}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">New feedback</div>
            <div className="text-xs text-gray-500">
              Email me when someone submits new feedback through the in-app widget.
            </div>
          </div>
          {feedbackPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50">
          <Checkbox
            checked={notifyComment}
            onCheckedChange={(state) =>
              handleChannelToggle("newComment", state === true, setNotifyComment, startComment)
            }
            disabled={!isDeveloper || commentPending}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">New comments</div>
            <div className="text-xs text-gray-500">
              Email me when anyone (other than me) replies on a feedback thread.
            </div>
          </div>
          {commentPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </label>
      </div>
    </section>
  );
}
