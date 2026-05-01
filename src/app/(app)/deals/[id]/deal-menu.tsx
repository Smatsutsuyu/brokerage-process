"use client";

import { useState, useTransition } from "react";
import {
  FileStack,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { toastComingSoon } from "@/components/planned-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deleteDeal } from "../actions";
import { DealModal, type EditingDeal } from "../deal-modal";

type DealMenuProps = {
  deal: EditingDeal;
};

export function DealMenu({ deal }: DealMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${deal.name}?`,
      description:
        "This permanently removes the deal and everything attached to it (checklist, contacts, Q&A, issues, consultants). This can't be undone.",
      confirmLabel: "Delete deal",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      // deleteDeal redirects to /, so no follow-up navigation needed.
      await deleteDeal(deal.dealId);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="Deal options"
          aria-label="Deal options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">
            <Sparkles className="h-3 w-3" />
            Planned actions
          </div>
          <DropdownMenuItem
            onClick={() =>
              toastComingSoon({
                feature: "Marketing Report PDF",
                description:
                  "Renders the buyer list grouped by Green / Yellow / Red interest tier as a Land Advisors-branded PDF.",
              })
            }
            className="text-[13px]"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Marketing Report
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              toastComingSoon({
                feature: "Compiled offer package PDF",
                description:
                  "Merges the SOO matrix, underwriting summaries, revenue charts, and supporting docs into a single PDF for ownership review.",
              })
            }
            className="text-[13px]"
          >
            <FileStack className="h-3.5 w-3.5" />
            Compile offer package
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              toastComingSoon({
                feature: "Owner Team status update",
                description:
                  "Drafts a templated weekly/bi-weekly status email to the Owner Team summarizing checklist progress, new offers, and open issues.",
              })
            }
            className="text-[13px]"
          >
            <Mail className="h-3.5 w-3.5" />
            Email status to Owner Team
          </DropdownMenuItem>

          <div className="my-1 border-t border-gray-100" />

          <DropdownMenuItem onClick={() => setEditOpen(true)} className="text-[13px]">
            <Pencil className="h-3.5 w-3.5" />
            Edit deal
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-[13px] text-red-600 focus:bg-red-50 focus:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete deal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DealModal open={editOpen} onOpenChange={setEditOpen} editing={deal} />
    </>
  );
}
