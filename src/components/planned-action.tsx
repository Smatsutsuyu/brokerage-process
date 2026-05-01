"use client";

import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Phase tag drives the toast subtitle so Chris can see roughly when each
// placeholder will be implemented. Mostly-aspirational right now — we're in
// Phase 1, Phase 2 is templated PDFs + email, Phase 3 is polish + handoff.
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
  // Short verb-phrase shown in the toast title, e.g. "Send OM blast" or
  // "Generate Marketing Report PDF".
  feature: string;
  // Longer description shown in the toast body. Should explain what will
  // happen when the button is real.
  description: string;
  // Roughly when this lands. Affects the subtitle copy.
  phase?: PlannedPhase;
  // Visible button label.
  label: string;
  icon?: LucideIcon;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
  className?: string;
  // When true, the button is rendered minimally (just icon + label, no full
  // button chrome). Used for inline-list placement where chrome would crowd.
  compact?: boolean;
};

// Renders like a real action button but on click shows a "coming soon" toast
// with a phase tag. Used to flesh out the design for client sign-off before
// any of the underlying functionality is built. Each placeholder names its
// future feature so reviewers can see exactly what each affordance will do.
export function PlannedAction({
  feature,
  description,
  phase = "phase_2",
  label,
  icon: Icon,
  size = "sm",
  variant = "outline",
  className,
  compact = false,
}: PlannedActionProps) {
  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toastComingSoon({ feature, description, phase });
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`${feature} — ${PHASE_LABEL[phase]}`}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700",
          className,
        )}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleClick}
      title={`${feature} — ${PHASE_LABEL[phase]}`}
      className={cn(
        // Subtle visual hint that this isn't a real action yet — dashed
        // border + amber accent. Hover brightens to standard.
        variant === "outline" && "border-dashed text-gray-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800",
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
