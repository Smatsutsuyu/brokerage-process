"use client";

import { useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { updateBuyerTier } from "../actions";

type Tier = "green" | "yellow" | "red" | "not_selected";

// Badge text is the meaning ("Interested", not "Green") — the color already
// conveys the tier; doubling up was redundant. Dropdown still shows the
// "Green — Interested" form for full clarity when changing tier.
const TIER_META: Record<
  Tier,
  { label: string; descriptive: string; badge: string; dot: string }
> = {
  green: {
    label: "Interested",
    descriptive: "Green — Interested",
    badge: "bg-green-100 text-green-800",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating",
    descriptive: "Yellow — Evaluating",
    badge: "bg-yellow-100 text-yellow-800",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Immediate Pass",
    descriptive: "Red — Immediate Pass",
    badge: "bg-red-100 text-red-800",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    descriptive: "Not Selected on Deal",
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
  },
};

const ORDER: Tier[] = ["green", "yellow", "red", "not_selected"];

type TierBadgeProps = {
  dealBuyerId: string;
  dealId: string;
  tier: Tier;
};

export function TierBadge({ dealBuyerId, dealId, tier }: TierBadgeProps) {
  const [isPending, startTransition] = useTransition();
  const current = TIER_META[tier];

  function handleSelect(next: Tier) {
    if (next === tier) return;
    startTransition(async () => {
      await updateBuyerTier({ dealBuyerId, dealId, tier: next });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-opacity",
          current.badge,
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full", current.dot)} />
        )}
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {ORDER.map((option) => {
          const meta = TIER_META[option];
          const isCurrent = option === tier;
          return (
            <DropdownMenuItem
              key={option}
              onSelect={() => handleSelect(option)}
              className="flex items-center gap-2 text-[13px]"
            >
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              <span className="flex-1">{meta.descriptive}</span>
              {isCurrent && <Check className="h-3.5 w-3.5 text-gray-400" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
