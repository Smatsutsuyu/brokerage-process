"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Mail } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CcOption = {
  id: string;
  name: string;
};

type CcPickerProps = {
  // Currently-selected CC user IDs. Names resolved client-side via `options`.
  selectedUserIds: string[];
  // Pool of selectable users (typically org members).
  options: CcOption[];
  // Called with the full new list after each toggle. Caller persists
  // (e.g. to deal_buyers.cc_user_ids). Async so the picker can show a
  // loading state while the write is in flight.
  onChange: (userIds: string[]) => Promise<void> | void;
  // Optional override for the trigger label when nothing is selected.
  emptyLabel?: string;
};

// Multi-select dropdown for picking CC recipients. Stays open across
// toggles (built on DropdownMenuCheckboxItem) so the user can pick a few
// names in one open. Persistence is the caller's concern via `onChange`.
export function CcPicker({
  selectedUserIds,
  options,
  onChange,
  emptyLabel = "+ Add CC",
}: CcPickerProps) {
  const [isPending, startTransition] = useTransition();
  // Mirror the selection locally so the trigger label updates instantly
  // on click, even though the persisted value comes from the server
  // round-trip via onChange. Re-syncs to the prop when the parent
  // re-renders with a fresh value.
  const [optimistic, setOptimistic] = useState<Set<string>>(
    () => new Set(selectedUserIds),
  );
  // Re-sync if the parent passes a different selection (e.g. after the
  // server action completes and the page re-renders).
  if (
    optimistic.size !== selectedUserIds.length ||
    selectedUserIds.some((id) => !optimistic.has(id))
  ) {
    // Bail out of equality check — replace the state. React's bailout
    // only triggers on Object.is so we have to compute and assign.
    // Using a setter inside render is OK only when guarded by an equality
    // check, which is what this is.
    setOptimistic(new Set(selectedUserIds));
  }

  function toggle(userId: string) {
    const next = new Set(optimistic);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setOptimistic(next);
    startTransition(async () => {
      await onChange(Array.from(next));
    });
  }

  // Trigger label: empty state vs 1-2 names listed vs N+ collapsed.
  // Stays compact even with a long org roster.
  const selectedNames = options
    .filter((o) => optimistic.has(o.id))
    .map((o) => o.name);
  const label =
    selectedNames.length === 0
      ? emptyLabel
      : selectedNames.length <= 2
        ? `CC: ${selectedNames.join(", ")}`
        : `CC: ${selectedNames[0]} +${selectedNames.length - 1}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1 rounded text-[12px] transition-colors",
          optimistic.size > 0
            ? "text-purple-700 hover:text-purple-900"
            : "text-gray-400 hover:text-gray-600",
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Mail className="h-3 w-3" />
        )}
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-gray-400 italic">
            No org members to CC.
          </div>
        ) : (
          options.map((opt) => {
            const isSelected = optimistic.has(opt.id);
            return (
              <DropdownMenuCheckboxItem
                key={opt.id}
                checked={isSelected}
                onCheckedChange={() => toggle(opt.id)}
                className="text-[13px]"
              >
                {opt.name}
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
