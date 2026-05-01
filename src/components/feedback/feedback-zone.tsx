"use client";

import { MessageSquarePlus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useFeedback } from "./feedback-context";

type FeedbackZoneProps = {
  section: string;
  children: ReactNode;
  className?: string;
  // "outside" (default): affordance floats just outside the top-right corner —
  //   avoids collision with corner content like chevrons, close buttons, etc.
  //   Requires the parent to not have overflow-hidden.
  // "inside": affordance sits inside the corner. Use when the zone abuts a
  //   viewport edge (e.g. priority ribbon at top of screen) where "outside"
  //   would be clipped.
  // "far": floats further out diagonally — use when the corner is occupied by
  //   another control (e.g. a dropdown menu trigger) that "outside" would
  //   overlap.
  align?: "outside" | "inside" | "far";
};

const POSITION_BY_ALIGN: Record<NonNullable<FeedbackZoneProps["align"]>, string> = {
  outside: "-top-2 -right-2",
  inside: "top-2 right-2",
  far: "-top-3 -right-5",
};

// Wraps a meaningful section so Chris can leave feedback specifically about it.
// Renders an unobtrusive corner affordance that intensifies on hover.
// Group hover keeps the affordance visible only when the user is engaging
// with this zone — avoids visual noise across the page.
export function FeedbackZone({ section, children, className, align = "outside" }: FeedbackZoneProps) {
  const { open } = useFeedback();
  const positionClasses = POSITION_BY_ALIGN[align];
  return (
    <div className={cn("group/feedback relative", className)}>
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open(section);
        }}
        title={`Feedback on ${section}`}
        aria-label={`Send feedback about ${section}`}
        className={cn(
          "absolute z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-md ring-1 ring-gray-200 transition-all group-hover/feedback:opacity-90 hover:scale-110 hover:text-amber-600 hover:opacity-100",
          positionClasses,
        )}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
