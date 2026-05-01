"use client";

import { MessageSquarePlus } from "lucide-react";

import { useFeedback } from "./feedback-context";

export function FeedbackButton() {
  const { open } = useFeedback();
  return (
    <button
      type="button"
      onClick={() => open("general")}
      className="bg-brand-ink fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
      title="Send feedback to Sean"
    >
      <MessageSquarePlus className="h-4 w-4" />
      Feedback
    </button>
  );
}
