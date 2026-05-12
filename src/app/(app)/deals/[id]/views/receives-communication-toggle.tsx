"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { setContactReceivesCommunication } from "../actions";

type ReceivesCommunicationToggleProps = {
  dealId: string;
  contactId: string;
  receivesCommunication: boolean;
};

// Inline toggle for the per-contact "receives communication" flag. Click
// flips the state with optimistic UI; the server action persists in the
// background and revalidate refreshes any other surfaces (blast preview).
//
// Two visual states:
//   - ON  (default): muted gray bell, low-key — signals "yes, included
//     in blasts" without dominating the row.
//   - OFF (opted out): "no blast" pill with BellOff, more prominent so
//     the exclusion is visible at a glance.
export function ReceivesCommunicationToggle({
  dealId,
  contactId,
  receivesCommunication,
}: ReceivesCommunicationToggleProps) {
  // Local optimistic state — flips immediately on click, server action
  // confirms in the background. Reverts if the action throws.
  const [optimistic, setOptimistic] = useState(receivesCommunication);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setContactReceivesCommunication({
          dealId,
          contactId,
          receivesCommunication: next,
        });
      } catch (err) {
        console.error("[receives-communication] toggle failed", err);
        setOptimistic(!next);
      }
    });
  }

  if (optimistic) {
    // Default state — small gray bell button.
    return (
      <button
        type="button"
        onClick={toggle}
        title="Receiving email blasts. Click to opt out."
        className={cn(
          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600",
          isPending && "opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Bell className="h-3 w-3" />
        )}
      </button>
    );
  }

  // Opted-out — prominent "no blast" pill.
  return (
    <button
      type="button"
      onClick={toggle}
      title="Excluded from email blasts. Click to opt back in."
      className={cn(
        "inline-flex items-center gap-0.5 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-gray-600 uppercase transition-colors hover:bg-amber-100 hover:text-amber-800",
        isPending && "opacity-60",
      )}
    >
      {isPending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <BellOff className="h-2.5 w-2.5" />
      )}
      no blast
    </button>
  );
}
