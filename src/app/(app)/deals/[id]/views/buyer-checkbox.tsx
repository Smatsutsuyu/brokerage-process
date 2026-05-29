"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  setBuyerCalled,
  setBuyerConfiSigned,
  setBuyerDdSent,
  setBuyerOfferReceived,
  setBuyerOmSent,
} from "../actions";

type BuyerCheckboxProps = {
  dealBuyerId: string;
  dealId: string;
  field: "called" | "confiSigned" | "omSent" | "ddSent" | "offerReceived";
  checked: boolean;
};

export function BuyerCheckbox({ dealBuyerId, dealId, field, checked }: BuyerCheckboxProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      if (field === "called") {
        await setBuyerCalled({ dealBuyerId, dealId, called: !checked });
      } else if (field === "confiSigned") {
        await setBuyerConfiSigned({ dealBuyerId, dealId, confiSigned: !checked });
      } else if (field === "omSent") {
        await setBuyerOmSent({ dealBuyerId, dealId, omSent: !checked });
      } else if (field === "ddSent") {
        await setBuyerDdSent({ dealBuyerId, dealId, ddSent: !checked });
      } else {
        await setBuyerOfferReceived({
          dealBuyerId,
          dealId,
          offerReceived: !checked,
        });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={checked}
      aria-label={checked ? "Mark unchecked" : "Mark checked"}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
        checked
          ? "border-brand-blue bg-brand-blue text-white hover:opacity-80"
          : "border-gray-300 hover:border-gray-400",
        isPending && "opacity-50",
      )}
    >
      {isPending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : checked ? (
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      ) : null}
    </button>
  );
}
