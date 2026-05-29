"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Mail } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Optional grouping for the dropdown. Items in the same group render
// together; a section divider + label appears when the group changes.
// Used by the blast composer to separate the deal's Owner Team from the
// broader Org Members list.
export type CcGroup = "owner" | "org";

const GROUP_LABEL: Record<CcGroup, string> = {
  owner: "Owner Team",
  org: "Org Members",
};

export type CcOption = {
  id: string;
  name: string;
  group?: CcGroup;
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

  // Bucket options into groups, preserving the order of first
  // appearance. Items without a `group` go under a sentinel "_default"
  // bucket which renders without a label. Each bucket becomes a
  // <DropdownMenuGroup> so DropdownMenuLabel renders correctly (Base
  // UI's GroupLabel primitive expects to live inside a Group), and
  // separators sit between buckets.
  const grouped = useMemo(() => {
    const map = new Map<string, CcOption[]>();
    for (const opt of options) {
      const key = opt.group ?? "_default";
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(opt);
    }
    return Array.from(map.entries()) as [string, CcOption[]][];
  }, [options]);

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
          grouped.map(([groupKey, items], groupIdx) => (
            <Fragment key={groupKey}>
              {groupIdx > 0 && <DropdownMenuSeparator />}
              {/* Plain div for the section header — Base UI's
                  DropdownMenuLabel didn't reliably render visible
                  output as a child of DropdownMenuContent in this
                  context (group + label requires a specific
                  parent setup), so we render the heading as a
                  styled div directly. */}
              {groupKey !== "_default" && (
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                  {GROUP_LABEL[groupKey as CcGroup]}
                </div>
              )}
              {items.map((opt) => {
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
              })}
            </Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
