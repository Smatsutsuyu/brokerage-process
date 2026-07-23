"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { cn } from "@/lib/utils";

import { toggleChecklistItem } from "../actions";

type ChecklistCheckboxProps = {
  itemId: string;
  dealId: string;
  completed: boolean;
};

export function ChecklistCheckbox({ itemId, dealId, completed }: ChecklistCheckboxProps) {
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function handleClick() {
    // Uncheck-only confirmation: clearing a completion loses the
    // completer + timestamp record. Checking has no confirmation
    // because it's cheap to correct.
    if (completed) {
      const ok = await confirm({
        title: "Uncheck this item?",
        description:
          "The completion timestamp and completer name will be cleared.",
        confirmLabel: "Uncheck",
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        await toggleChecklistItem({ itemId, dealId, completed: !completed });
      } catch (err) {
        console.error("[toggle-checklist-item]", err);
        toast.error("Could not update the item. Try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={completed}
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
      className={cn(
        "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
        completed
          ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
          : "border-gray-300 hover:border-gray-400",
        isPending && "opacity-50",
      )}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : completed ? (
        <span className="text-[10px] font-bold">✓</span>
      ) : null}
    </button>
  );
}
