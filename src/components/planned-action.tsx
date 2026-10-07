"use client";

import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Phase tag shown under the description so readers can see roughly when
// each placeholder is expected to land.
export type PlannedPhase = "phase_2" | "phase_3" | "future";

const PHASE_LABEL: Record<PlannedPhase, string> = {
  phase_2: "Phase 2 — document & email automation",
  phase_3: "Phase 3 — polish & handoff",
  future: "Future engagement",
};

// Standalone toast helper so non-button surfaces (dropdown items, tooltip
// CTAs, etc.) can also trigger the same "coming soon" notification without
// rendering a PlannedAction button.
export function toastComingSoon(opts: {
  feature: string;
  description: string;
  phase?: PlannedPhase;
}) {
  const phase = opts.phase ?? "phase_2";
  toast(`Coming soon: ${opts.feature}`, {
    // Sonner's default description color is too light against the popover
    // bg — explicit slate-700 keeps it legible for the long body text.
    description: (
      <div className="space-y-1.5">
        <p className="text-[13px] text-slate-700">{opts.description}</p>
        <p className="text-[11px] font-semibold text-amber-700">{PHASE_LABEL[phase]}</p>
      </div>
    ),
    icon: <Sparkles className="h-4 w-4 text-amber-500" />,
    duration: 5000,
    className: "border-amber-200",
  });
}

type PlannedActionProps = {
  // Short verb-phrase shown as the tooltip title, e.g. "Send OM blast" or
  // "Generate Marketing Report PDF".
  feature: string;
  // Longer description shown in the tooltip body. Should explain what will
  // happen when the button is real.
  description: string;
  // Roughly when this lands. Affects the subtitle copy.
  phase?: PlannedPhase;
  // Visible button label.
  label: string;
  icon?: LucideIcon;
  size?: "sm" | "default";
  // Kept for call-site compatibility; every placeholder now renders in the
  // same grayed-out style regardless.
  variant?: "default" | "outline" | "ghost";
  className?: string;
  // When true, the button is rendered minimally (just icon + label, no full
  // button chrome). Used for inline-list placement where chrome would crowd.
  compact?: boolean;
};

// A button for a feature that isn't built yet. Grayed out and inert, with
// the explanation in a hover tooltip, so it reads as "not here yet" at a
// glance (Sean, 2026-10-06). It used to look like a live button and only
// revealed itself with a "Coming soon" toast on click.
//
// aria-disabled rather than the disabled attribute: a disabled button
// swallows pointer events in some browsers, which would kill the hover
// tooltip that is now the whole point.
export function PlannedAction({
  feature,
  description,
  phase = "phase_2",
  label,
  icon: Icon,
  size = "sm",
  className,
  compact = false,
}: PlannedActionProps) {
  const chrome = compact
    ? "gap-1 rounded px-2 py-1 text-[11px]"
    : cn(
        "gap-1.5 rounded-md border border-dashed border-gray-200 bg-gray-50 font-medium",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
      );
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-disabled="true"
        aria-label={`${label} (not available yet)`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "inline-flex cursor-not-allowed items-center font-medium whitespace-nowrap text-gray-300 select-none",
          chrome,
          className,
        )}
      >
        {Icon && <Icon className={iconSize} />}
        {label}
      </TooltipTrigger>
      <TooltipContent className="space-y-1">
        <p className="font-semibold text-slate-800">Not available yet: {feature}</p>
        <p className="text-slate-600">{description}</p>
        <p className="text-[11px] font-semibold text-amber-700">{PHASE_LABEL[phase]}</p>
      </TooltipContent>
    </Tooltip>
  );
}
