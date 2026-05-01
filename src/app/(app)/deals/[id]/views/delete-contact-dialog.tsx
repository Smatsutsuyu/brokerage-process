"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { deleteContact } from "../actions";

type DeleteContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  contactId: string | null;
  contactName: string | null;
};

export function DeleteContactDialog({
  open,
  onOpenChange,
  dealId,
  contactId,
  contactName,
}: DeleteContactDialogProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!contactId) return;
    startTransition(async () => {
      await deleteContact({ dealId, contactId });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete contact?</DialogTitle>
          <DialogDescription>
            This removes <strong>{contactName ?? "this contact"}</strong> from the system. The
            builder stays on the deal. This can&rsquo;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
