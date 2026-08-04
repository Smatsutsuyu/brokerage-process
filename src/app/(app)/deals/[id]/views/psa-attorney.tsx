"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Gavel, Loader2, Pencil } from "lucide-react";

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
import {
  describePsaResolution,
  resolvePsaAttorney,
  type PsaAttorneyRow,
  type PsaSide,
} from "@/lib/psa-attorney";
import { cn } from "@/lib/utils";

import { savePsaAttorneyDecision, type PsaDrafting } from "../actions";

// What the checklist row receives. The attorney comes from the deal's
// consultant roster; only the drafting decision lives on the deal.
export type PsaAttorneyState = {
  rows: PsaAttorneyRow[];
  drafting: PsaDrafting | null;
};

// Buyer / Seller, not "we" / "they". The row title says "(we or they
// draft)" because that is Chris's wording from the Excel, but the stored
// enum is buyer|seller and translating it to we/they requires asserting
// which side of the table we are on. That assertion was briefly added and
// read backwards on a real deal, so the labels state the fact instead and
// let the reader map it.
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

// Inline display + edit for the PSA Attorney decision on the Phase 1
// "Determine PSA Attorney (we or they draft)" row.
//
// Two facts, deliberately kept apart. Who drafts is a property of the
// transaction and writes to the deal. Who the attorney is writes to the
// consultant roster, which is the single place PSA attorney contact
// details live and the only one that can hold an email address, so the
// Phase 4 kickoff send has something to address.
//
// Recording only "they draft" months before counsel exists stays a
// three-click, zero-typing action: the attorney fields are optional and
// leaving them blank writes no consultant row at all.
export function PsaAttorneyInline({ dealId, state }: PsaAttorneyProps) {
  const [editing, setEditing] = useState(false);
  const res = resolvePsaAttorney({ rows: state.rows, drafting: state.drafting });
  const hasAny = state.rows.length > 0 || Boolean(state.drafting);

  return (
    <span className="inline-flex items-center gap-0.5">
      {hasAny ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit the PSA attorney and drafting decision"
          className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors"
        >
          <Gavel className="h-3 w-3" />
          <span className="max-w-[260px] truncate">{describePsaResolution(res)}</span>
          <Pencil className="h-2.5 w-2.5 opacity-60" />
        </button>
      ) : (
        // Neutral, not amber. An empty roster during go-to-market is the
        // normal condition of a deal, not a problem to flag, and painting
        // the standard state as a warning teaches the user to ignore
        // warnings.
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors"
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

type PsaAttorneyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  state: PsaAttorneyState;
};

function PsaAttorneyModal({ open, onOpenChange, dealId, state }: PsaAttorneyModalProps) {
  // The row this panel edits. With more than one attorney on the deal
  // (co-counsel, or one per side) the panel edits the first and sends the
  // user to the Consultants tab for the rest, rather than growing a
  // second roster manager on a checklist row.
  const existing = state.rows[0] ?? null;

  const [drafting, setDrafting] = useState<PsaDrafting | null>(state.drafting);
  const [side, setSide] = useState<PsaSide>("seller");
  const [firm, setFirm] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setError(null), 150);
      return () => clearTimeout(t);
    }
    setDrafting(state.drafting);
    // Side defaults from the drafting decision rather than being guessed:
    // if our side drafts, the attorney recorded here is ours.
    setSide(existing?.side ?? (state.drafting === "buyer" ? "buyer" : "seller"));
    setFirm(existing?.firmName ?? "");
    setName(existing?.contactName ?? "");
    setEmail(existing?.contactEmail ?? "");
    setError(null);
  }, [open, state, existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedFirm = firm.trim();
    // Blank firm means "no attorney recorded yet", which is a legitimate
    // Phase 1 state. Save the drafting decision and leave the roster
    // alone. Never a delete: removal belongs on the Consultants tab.
    if (!trimmedFirm && existing) {
      setError(
        "Clearing an attorney is done on the Consultants tab. Leave the firm as it is, or remove the record there.",
      );
      return;
    }
    startTransition(async () => {
      try {
        await savePsaAttorneyDecision({
          dealId,
          drafting,
          attorney: trimmedFirm
            ? {
                consultantId: existing?.id,
                side,
                firmName: trimmedFirm,
                contactName: name,
                contactEmail: email,
              }
            : undefined,
        });
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
          <DialogTitle>PSA Attorney</DialogTitle>
          <DialogDescription>
            Who drafts is recorded on the deal. The attorney is saved to this
            deal&apos;s consultant roster, so the Phase 4 kickoff email has an
            address to send to.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>Who drafts the PSA?</Label>
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
              Click an active choice again to clear it. This is often the only
              thing known at this stage, and it saves on its own.
            </p>
          </div>

          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                Attorney {existing ? "" : "(optional)"}
              </Label>
              <Link
                href={`/deals/${dealId}?tab=consultants`}
                className="text-brand-blue inline-flex items-center gap-0.5 text-[11px] hover:underline"
              >
                Consultants tab
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="psa-side" className="text-gray-600">
                Side
              </Label>
              <div id="psa-side" className="grid grid-cols-2 gap-2">
                {(["seller", "buyer"] as PsaSide[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSide(value)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                      value === side
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                    )}
                  >
                    {value === "seller" ? "Seller-side" : "Buyer-side"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="psa-firm">Firm / Company</Label>
              <Input
                id="psa-firm"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                placeholder="e.g. Cox Castle"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="psa-name" className="text-gray-600">
                Attorney name{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="psa-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Matt Levy"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="psa-email" className="text-gray-600">
                Email{" "}
                <span className="text-xs font-normal text-gray-400">
                  (needed for the Phase 4 kickoff email)
                </span>
              </Label>
              <Input
                id="psa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. mlevy@coxcastle.com"
              />
            </div>

            {/* Flipping "who drafts" without touching the attorney is the
                normal way to end up here, and it is not necessarily wrong:
                the other side's counsel may simply not be recorded yet.
                Say so plainly rather than letting the chip look broken. */}
            {drafting && drafting !== "na" && side !== drafting && (
              <p className="text-[11px] text-amber-700">
                This attorney is {side === "buyer" ? "buyer-side" : "seller-side"},
                but {DRAFTING_LABEL[drafting].toLowerCase()} is selected above.
                That is fine if the drafting side&apos;s counsel is not recorded
                yet. If this firm is the one drafting, switch the side.
              </p>
            )}

            {state.rows.length > 1 && (
              <p className="text-[11px] text-gray-500">
                This deal has {state.rows.length} PSA attorneys on its roster.
                This panel edits the first; manage the rest on the Consultants
                tab.
              </p>
            )}
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
