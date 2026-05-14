"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";

import { OM_BLAST_TEMPLATE } from "@/lib/email-templates";

import { getLeadsOnDeal, getOmItemId } from "../actions";
import { AttachmentSourceLine } from "./attachment-source-line";
import { BlastModal } from "./blast-modal";
import type { LeadOption } from "./lead-picker";

type OmBlastButtonProps = {
  dealId: string;
  // Match the checklist row's compact button styling so it sits with the
  // PlannedAction siblings without standing out (those are the "coming
  // soon" placeholders rendered next to it on other items).
  compact?: boolean;
  // Item ID of the "Offering Memorandum" row — the source of the file we
  // attach to the blast. When provided, hovering the button draws a faint
  // line back to that row so the user can see where the file comes from.
  // When omitted (e.g. the contacts-tab toolbar doesn't have it on
  // hand), the button looks it up itself on first open via getOmItemId.
  attachmentSourceItemId?: string | null;
};

// Fetches lead options on first open (rather than at mount) so the
// checklist render doesn't pay a query for every deal page load — only
// the deals where Chris actually clicks "Send OM blast". Deal-scoped so
// the picker matches the contacts tab's behavior.
export function OmBlastButton({
  dealId,
  compact = true,
  attachmentSourceItemId,
}: OmBlastButtonProps) {
  const [open, setOpen] = useState(false);
  const [leadOptions, setLeadOptions] = useState<LeadOption[] | null>(null);
  const [resolvedItemId, setResolvedItemId] = useState<string | null | undefined>(
    attachmentSourceItemId ?? undefined,
  );
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [, startLoad] = useTransition();

  useEffect(() => {
    if (!open || leadOptions !== null) return;
    startLoad(async () => {
      try {
        const opts = await getLeadsOnDeal({ dealId });
        setLeadOptions(opts);
      } catch (err) {
        console.error("[om-blast] lead options load failed", err);
        setLeadOptions([]);
      }
    });
  }, [open, leadOptions, dealId]);

  // Lazy OM-item-id lookup for callers that don't have it on hand
  // (contacts tab toolbar). Only runs once on first open if the prop
  // wasn't passed; resolves to null when the deal has no OM row.
  useEffect(() => {
    if (!open || resolvedItemId !== undefined) return;
    startLoad(async () => {
      try {
        const id = await getOmItemId({ dealId });
        setResolvedItemId(id);
      } catch (err) {
        console.error("[om-blast] OM item id lookup failed", err);
        setResolvedItemId(null);
      }
    });
  }, [open, resolvedItemId, dealId]);

  const effectiveItemId = resolvedItemId ?? null;

  // Hide the connector while the modal is open — distracting once the
  // user has committed to the action. Same when the source item id isn't
  // known (e.g., this deal has no OM row, or the lookup hasn't resolved).
  const showConnector = hovered && !open && Boolean(effectiveItemId);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        title={
          effectiveItemId
            ? "Filter contacts by tier and assignment, preview the email, then send. Attaches the file from the Offering Memorandum task."
            : "Filter contacts by tier and assignment, preview the email, then send"
        }
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50",
        )}
      >
        <Mail className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Send OM blast
      </button>

      {showConnector && effectiveItemId && (
        <AttachmentSourceLine
          fromRef={buttonRef}
          toElementId={`checklist-item-${effectiveItemId}`}
        />
      )}

      {/* Render lazily — leadOptions is null until first open. BlastModal
          handles its own internal state so re-mounting between opens is
          fine (no stale tier selections leaking across opens). */}
      {leadOptions !== null && (
        <BlastModal
          open={open}
          onOpenChange={setOpen}
          dealId={dealId}
          leadOptions={leadOptions}
          template={OM_BLAST_TEMPLATE}
          title="OM blast"
          defaultTiers={["green", "yellow"]}
          attachmentSourceItemId={effectiveItemId}
        />
      )}
    </>
  );
}
