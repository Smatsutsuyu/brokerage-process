"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { DealModal } from "@/app/(app)/deals/deal-modal";
import { Button } from "@/components/ui/button";

export function NewDealButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed text-xs font-medium"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        New Deal
      </Button>
      <DealModal open={open} onOpenChange={setOpen} />
    </>
  );
}
