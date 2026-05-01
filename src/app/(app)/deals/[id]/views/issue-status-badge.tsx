"use client";

import { useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { setIssueStatus, type IssueStatus } from "../actions";

const STATUS_META: Record<IssueStatus, { label: string; badge: string }> = {
  open: { label: "Open", badge: "bg-red-100 text-red-700" },
  in_progress: { label: "In Progress", badge: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", badge: "bg-green-100 text-green-800" },
};

const ORDER: IssueStatus[] = ["open", "in_progress", "resolved"];

type IssueStatusBadgeProps = {
  dealId: string;
  issueId: string;
  status: IssueStatus;
};

export function IssueStatusBadge({ dealId, issueId, status }: IssueStatusBadgeProps) {
  const [isPending, startTransition] = useTransition();
  const current = STATUS_META[status];

  function handleSelect(next: IssueStatus) {
    if (next === status) return;
    startTransition(async () => {
      await setIssueStatus({ dealId, issueId, status: next });
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
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {ORDER.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => handleSelect(option)}
            className="text-[13px]"
          >
            {STATUS_META[option].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
