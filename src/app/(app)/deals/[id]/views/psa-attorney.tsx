"use client";

import { useEffect, useState, useTransition } from "react";
import { Gavel, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { setPsaAttorney, type PsaDrafting } from "../actions";

export type PsaAttorneyState = {
  name: string | null;
  firm: string | null;
  drafting: PsaDrafting | null;
};

const DRAFTING_LABEL: Record<PsaDrafting, string> = {
  buyer: "Buyer drafting",
  seller: "Seller drafting",
  na: "N/A",
};

const DRAFTING_OPTIONS: PsaDrafting[] = ["buyer", "seller", "na"];

type PsaAttorneyProps = {
  dealId: string;
  state: PsaAttorneyState;
};

// Compact display + edit affordance for the PSA Attorney decision. Lives
// inline on the "Determine PSA Attorney (drafting preference)" checklist
// row. Three states:
//
// - Empty → small "Set details" button opens the modal
// - Partial/full → chip summarizing the current decision (e.g. "Smith & Co —
//   Buyer drafting") with a pencil icon to re-open the modal
//
// Saving with all fields blank is the same as clearing.
export function PsaAttorneyInline({ dealId, state }: PsaAttorneyProps) {
  const [editing, setEditing] = useState(false);
  const hasAny = Boolean(state.name || state.firm || state.drafting);

  return (
    <span className="inline-flex items-center gap-0.5">
      {hasAny ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit PSA Attorney details"
          className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors"
        >
          <Gavel className="h-3 w-3" />
          <span className="max-w-[220px] truncate">{summarize(state)}</span>
          <Pencil className="h-2.5 w-2.5 opacity-60" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700"
        >
          <Gavel className="h-3 w-3" />
          Set details
        </button>
      )}
      <PsaAttorneyModal
        open={editing}
        onOpenChange={setEditing}
        dealId={dealId}
        state={state}
      />
    </span>
  );
}

function summarize(state: PsaAttorneyState): string {
  const head = state.firm ?? state.name ?? "—";
  const tail = state.drafting ? DRAFTING_LABEL[state.drafting] : null;
  return tail ? `${head} · ${tail}` : head;
}

type PsaAttorneyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  state: PsaAttorneyState;
};

function PsaAttorneyModal({ open, onOpenChange, dealId, state }: PsaAttorneyModalProps) {
  const [name, setName] = useState(state.name ?? "");
  const [firm, setFirm] = useState(state.firm ?? "");
  const [drafting, setDrafting] = useState<PsaDrafting | null>(state.drafting);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setError(null), 150);
      return () => clearTimeout(t);
    }
    setName(state.name ?? "");
    setFirm(state.firm ?? "");
    setDrafting(state.drafting);
    setError(null);
  }, [open, state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await setPsaAttorney({ dealId, name, firm, drafting });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PSA Attorney details</DialogTitle>
          <DialogDescription>
            Captured at the deal level — visible inline on the checklist. All fields are
            optional; save with everything blank to clear.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="psa-firm">Firm / Company</Label>
            <Input
              id="psa-firm"
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              placeholder="e.g. Smith & Co"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="psa-name" className="text-gray-600">
              Attorney name <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="psa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
            />
          </div>

          <div className="grid gap-2">
            <Label>Drafting preference</Label>
            <div className="grid grid-cols-3 gap-2">
              {DRAFTING_OPTIONS.map((value) => {
                const isActive = value === drafting;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDrafting(isActive ? null : value)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                    )}
                  >
                    {DRAFTING_LABEL[value]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500">
              Click an active choice again to clear it.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
