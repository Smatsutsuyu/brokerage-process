"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  FileStack,
  FileText,
  ImageIcon,
  Mail,
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
import type { EditingDeal } from "../deal-modal";
import { BannerUploaderModal } from "./banner-uploader-modal";

type DealMenuProps = {
  deal: EditingDeal;
  hasBanner: boolean;
  // Parent (DealHeader) owns the DealModal so the header's "+ Add
  // purchase price" CTA can open the same instance. Menu just fires
  // the callback when the Edit-deal item is picked.
  onEditClick: () => void;
};

export function DealMenu({ deal, hasBanner, onEditClick }: DealMenuProps) {
  const [bannerOpen, setBannerOpen] = useState(false);
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
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
          title="Edit deal, change banner, generate reports"
          aria-label="Deal options"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">
            <Sparkles className="h-3 w-3" />
            Planned actions
          </div>
          <DropdownMenuItem
            onClick={() => {
              // Direct browser navigation triggers the file download via
              // the API route's Content-Disposition: attachment header.
              window.open(`/api/deals/${deal.dealId}/marketing-report.pdf`, "_blank");
            }}
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

          <DropdownMenuItem onClick={() => setBannerOpen(true)} className="text-[13px]">
            <ImageIcon className="h-3.5 w-3.5" />
            {hasBanner ? "Change banner image" : "Set banner image"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditClick} className="text-[13px]">
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

      <BannerUploaderModal
        open={bannerOpen}
        onOpenChange={setBannerOpen}
        dealId={deal.dealId}
        dealName={deal.name}
        hasBanner={hasBanner}
      />
    </>
  );
}
