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

import { setBuyerLead } from "../actions";

export type LeadOption = {
  id: string;
  name: string;
};

type LeadPickerProps = {
  dealId: string;
  dealBuyerId: string;
  currentUserId: string | null;
  currentName: string | null;
  options: LeadOption[];
};

export function LeadPicker({
  dealId,
  dealBuyerId,
  currentUserId,
  currentName,
  options,
}: LeadPickerProps) {
  const [isPending, startTransition] = useTransition();

  function handleSelect(userId: string | null) {
    if (userId === currentUserId) return;
    startTransition(async () => {
      await setBuyerLead({ dealBuyerId, dealId, leadUserId: userId });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1 rounded text-gray-600 transition-colors hover:text-gray-900",
          !currentUserId && "text-gray-300 hover:text-gray-500",
          isPending && "opacity-60",
        )}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        <span>{currentName ?? "Unassigned"}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          onClick={() => handleSelect(null)}
          className="flex items-center gap-2 text-[13px] text-gray-600"
        >
          <span className="flex-1 italic">Unassigned</span>
          {currentUserId === null && <Check className="h-3.5 w-3.5 text-gray-400" />}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => handleSelect(option.id)}
            className="flex items-center gap-2 text-[13px]"
          >
            <span className="flex-1">{option.name}</span>
            {option.id === currentUserId && <Check className="h-3.5 w-3.5 text-gray-400" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
