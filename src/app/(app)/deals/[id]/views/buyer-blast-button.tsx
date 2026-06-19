"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { useInlineError } from "@/components/inline-error-bubble";
import { type EmailTemplate } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

import {
  getAttachmentsForItem,
  getBnfDueDate,
  getLeadsOnDeal,
  getOfferingDate,
} from "../actions";
import { BlastModal } from "./blast-modal";
import type { LeadOption } from "./lead-picker";

type Tier = "green" | "yellow" | "red" | "not_selected";

// Validation mode for the pre-flight check on click.
//
//   "file" — at least one uploaded file must be on the source row. Use
//            for sends where the recipient needs the document attached
//            (Market Study, Q&A File). Links don't count because a URL
//            in the body doesn't put the document in their inbox.
//
//   "any"  — at least one file OR link must be on the source row. Use
//            for sends where a Dropbox / SharePoint folder URL is the
//            common case (Share Marketing Due Diligence Folder).
//
// Inline-bubble rejection (not sonner toast) per the convention in
// `src/components/inline-error-bubble.tsx`. See that file's header
// comment for the broader pattern across "send a file and/or link"
// row buttons.
export type AttachmentRequirement = "file" | "any";

type BuyerBlastButtonProps = {
  dealId: string;
  // Visible button label on the checklist row.
  label: string;
  // Title shown in modal header (Step 1 prefixes "Send", Step 2 uses
  // verbatim).
  modalTitle: string;
  // Tooltip on the trigger.
  title?: string;
  template: EmailTemplate;
  defaultTiers: Tier[];
  // Optional checklist item to pull attachments from. When the row's
  // own files/links are the source, pass the row's own item.id; when
  // attachments live on a different row (like OM blast pulling from
  // Phase 1 Offering Memorandum), pass that other id.
  attachmentSourceItemId?: string | null;
  // Filter out builders who already submitted an offer. Used by the
  // "Follow up Missing Offers" send.
  excludeOfferReceived?: boolean;
  // Pre-flight validation gate. When set, click is rejected with an
  // inline error bubble if the source row doesn't satisfy the mode.
  // See AttachmentRequirement above for semantics.
  requireAttachment?: AttachmentRequirement;
  // Human-friendly noun used in the rejection message. Falls back to a
  // generic word grammatical to the mode ("file" / "file or link") so
  // the message stays readable either way.
  attachmentNoun?: string;
  // Pass-through to BlastModal's tracking mode. Set "dd" for the Phase 2
  // Share DD Folder send so the modal warns / auto-unchecks / marks the
  // dd_sent_at flag the same way the OM blast does for om_sent_at.
  sentTracking?: "om" | "dd";
  // Pre-flight: refuse to open the composer if the deal's Offering Date
  // milestone isn't set. Used by the 1-week offers-due notice button so
  // we don't ship an email body with an unsubstituted {{dueDate}}.
  requireOfferingDate?: boolean;
  // Pre-flight: refuse to open the composer if the deal's "Send out B&F"
  // row trackedDate isn't set. Used by the Phase 3 B&F invite button so
  // {{bnfDueDate}} is always resolved when the email goes out.
  requireBnfDate?: boolean;
  // Disables the final "Send" button inside the modal but leaves the
  // composer fully usable (recipient pick, preview, body edit). Used for
  // skeleton rows (e.g. Phase 3 B&F invite) where the row's draft can
  // be exercised but the actual send isn't wired yet. Tooltip on the
  // disabled Send button uses `disableSendReason` when provided.
  disableSend?: boolean;
  disableSendReason?: string;
  // Deal-team sub-teams whose members should be pre-checked in the CC
  // picker for every builder when the composer opens. Used by the OM
  // blast button to default-CC the Broker Team.
  defaultCcTeams?: Array<"owner" | "broker">;
  compact?: boolean;
};

// Reusable trigger for any tier-filtered "send to buyers" action on a
// Phase 2 checklist row. Lazy-loads the lead-options list on first
// open, then opens the configurable BlastModal with the template +
// tier defaults + attachment source the caller provided. OmBlastButton
// is a thin sibling that adds the "attachment source connector"
// affordance for the cross-row OM file relationship.
export function BuyerBlastButton({
  dealId,
  label,
  modalTitle,
  title,
  template,
  defaultTiers,
  attachmentSourceItemId,
  excludeOfferReceived,
  requireAttachment,
  attachmentNoun,
  sentTracking,
  requireOfferingDate,
  requireBnfDate,
  disableSend,
  disableSendReason,
  defaultCcTeams,
  compact = true,
}: BuyerBlastButtonProps) {
  const [open, setOpen] = useState(false);
  const [leadOptions, setLeadOptions] = useState<LeadOption[] | null>(null);
  const [, startLoad] = useTransition();
  const [checking, startChecking] = useTransition();
  const { error: inlineError, show: showInlineError, clear: clearInlineError, bubble } =
    useInlineError();

  useEffect(() => {
    if (!open || leadOptions !== null) return;
    startLoad(async () => {
      try {
        const opts = await getLeadsOnDeal({ dealId });
        setLeadOptions(opts);
      } catch (err) {
        console.error("[buyer-blast] lead options load failed", err);
        setLeadOptions([]);
      }
    });
  }, [open, leadOptions, dealId]);

  // Pre-flight: when requireAttachment and/or requireOfferingDate are
  // set, verify each gate before opening the modal. Bails inline (small
  // red bubble anchored under the button) so the user sees which row
  // failed without scanning a corner toast.
  function handleClick() {
    clearInlineError();
    const needsAttachmentCheck = Boolean(requireAttachment && attachmentSourceItemId);
    const needsOfferingDateCheck = Boolean(requireOfferingDate);
    const needsBnfDateCheck = Boolean(requireBnfDate);
    if (!needsAttachmentCheck && !needsOfferingDateCheck && !needsBnfDateCheck) {
      setOpen(true);
      return;
    }
    startChecking(async () => {
      try {
        if (needsOfferingDateCheck) {
          const offeringDate = await getOfferingDate({ dealId });
          if (!offeringDate) {
            showInlineError(
              "Set the Offering Date on the Phase 2 row first, then send. The reminder body uses it.",
            );
            return;
          }
        }
        if (needsBnfDateCheck) {
          const bnfDate = await getBnfDueDate({ dealId });
          if (!bnfDate) {
            showInlineError(
              "Set the B&F due date on this row first, then send. The invite body uses it.",
            );
            return;
          }
        }
        if (needsAttachmentCheck && attachmentSourceItemId) {
          const att = await getAttachmentsForItem({ itemId: attachmentSourceItemId });
          const hasFile = att.choices.some((c) => c.kind === "file");
          const hasLink = att.choices.some((c) => c.kind === "link");
          const satisfied =
            requireAttachment === "file" ? hasFile : hasFile || hasLink;
          if (!satisfied) {
            const noun =
              attachmentNoun ?? (requireAttachment === "file" ? "file" : "file or link");
            showInlineError(
              `No ${noun} attached. Add one to this row first, then send.`,
            );
            return;
          }
        }
        setOpen(true);
      } catch (err) {
        console.error("[buyer-blast] pre-flight failed", err);
        // Network/server errors still go through sonner — they're not
        // the user's fault and aren't tied to the row's data state.
        toast.error("Couldn't check the row state. Try again.");
      }
    });
  }

  return (
    <>
      <span className="relative inline-block">
        <button
          type="button"
          onClick={handleClick}
          disabled={checking}
          title={title ?? label}
          className={cn(
            compact
              ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-700"
              : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50",
            checking && "opacity-60",
            inlineError && "ring-1 ring-red-300",
          )}
        >
          {checking ? (
            <Loader2 className={cn("animate-spin", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          ) : (
            <Mail className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          )}
          {label}
        </button>
        {bubble}
      </span>

      {leadOptions !== null && (
        <BlastModal
          open={open}
          onOpenChange={setOpen}
          dealId={dealId}
          leadOptions={leadOptions}
          template={template}
          title={modalTitle}
          defaultTiers={defaultTiers}
          attachmentSourceItemId={attachmentSourceItemId}
          excludeOfferReceived={excludeOfferReceived}
          sentTracking={sentTracking}
          disableSend={disableSend}
          disableSendReason={disableSendReason}
          defaultCcTeams={defaultCcTeams}
        />
      )}
    </>
  );
}
