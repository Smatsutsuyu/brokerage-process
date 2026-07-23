"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ImageIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm/confirm-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { archiveDeal, deleteDeal, unarchiveDeal } from "../actions";
import type { EditingDeal } from "../deal-modal";
import { BannerUploaderModal } from "./banner-uploader-modal";

type DealActionsMenuProps = {
  deal: EditingDeal;
  hasBanner: boolean;
};

// Overflow menu for secondary + destructive deal actions. Sits to the
// right of the primary Email Status + Edit buttons in the deal header.
//
// Archive-then-delete: an active deal shows only "Archive". Delete
// appears once the deal is archived, alongside "Unarchive". Server-side
// deleteDeal also enforces archivedAt IS NOT NULL or the action throws.
export function DealActionsMenu({ deal, hasBanner }: DealActionsMenuProps) {
  const [bannerOpen, setBannerOpen] = useState(false);
  const [isArchiving, startArchive] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const confirm = useConfirm();

  const isArchived = deal.archivedAt !== null;
  const busy = isArchiving || isDeleting;

  async function handleArchive() {
    const ok = await confirm({
      title: `Archive ${deal.name}?`,
      description:
        "The deal will be hidden from the sidebar and priority ribbon. You can unarchive it later.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    startArchive(async () => {
      try {
        await archiveDeal(deal.dealId);
      } catch (err) {
        console.error("[archive-deal]", err);
        toast.error("Could not archive the deal. Try again.");
      }
    });
  }

  function handleUnarchive() {
    startArchive(async () => {
      try {
        await unarchiveDeal(deal.dealId);
      } catch (err) {
        console.error("[unarchive-deal]", err);
        toast.error("Could not unarchive the deal. Try again.");
      }
    });
  }

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
      try {
        // deleteDeal redirects to /, so no follow-up navigation needed
        // on success. Failure hits the catch below.
        await deleteDeal(deal.dealId);
      } catch (err) {
        console.error("[delete-deal]", err);
        toast.error("Could not delete the deal. Try again.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
            busy && "cursor-wait opacity-60",
          )}
          title="More deal actions"
          aria-label="More deal actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => setBannerOpen(true)}
            className="text-[13px]"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {hasBanner ? "Change banner image" : "Set banner image"}
          </DropdownMenuItem>

          {isArchived ? (
            <>
              <DropdownMenuItem
                onClick={handleUnarchive}
                disabled={busy}
                className="text-[13px]"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Unarchive deal
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={busy}
                className="text-[13px] text-red-600 focus:bg-red-50 focus:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete deal
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={handleArchive}
              disabled={busy}
              className="text-[13px]"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive deal
            </DropdownMenuItem>
          )}
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
