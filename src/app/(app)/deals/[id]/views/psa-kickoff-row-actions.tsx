"use client";

import { useState, useTransition } from "react";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import {
  EmailPreviewModal,
  type EmailAttachment,
  type EmailCcInitialEntry,
  type EmailCcUserOption,
  type EmailRecipient,
  type EmailSenderChoice,
} from "@/components/email/email-preview-modal";
import { useInlineError } from "@/components/inline-error-bubble";
import { PSA_KICKOFF_TEMPLATE } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

import {
  getAttachmentsForItem,
  getOmBlastTemplateContext,
  getPsaKickoffComposerData,
  getSignLoiItemId,
  sendBlastEmails,
} from "../actions";
import { runPreflight } from "./deal-team-preflight";

// One synthetic group id so the composer emits a single message. It
// groups on builderId and this value is passed through to a Resend tag,
// which accepts ASCII letters, digits, underscore and dash only.
const PSA_GROUP_ID = "psa-attorney";
const PSA_GROUP_LABEL = "PSA Attorney";

type PsaKickoffRowActionsProps = {
  dealId: string;
  // The "Kick off PSA" checklist row. Used as the first source for the
  // DD folder link, ahead of the Phase 1 Dropbox folder row.
  itemId: string;
};

// Phase 4 "Kick off PSA" row. Emails the deal's PSA attorney to start
// the purchase and sale agreement.
//
// Recipients come from the consultant roster (role = "psa_attorney"),
// which is the single place PSA attorney contact details live. Every
// attorney on the deal with a usable address goes on the To line, both
// sides: a kickoff that reaches only one side's counsel is a mistake,
// not a feature. Our side of the table is CC'd by default; the Buyer
// Team is offered but never pre-checked.
//
// Deliberately NOT gated on the PSA effective date. "Kick off PSA"
// starts the process and the effective date is recorded when the PSA is
// signed, so requiring it would mean telling the user to set a date this
// very email is what produces.
export function PsaKickoffRowActions({ dealId, itemId }: PsaKickoffRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>();
  const [ccOptions, setCcOptions] = useState<EmailCcUserOption[]>([]);
  const [ccInitial, setCcInitial] = useState<EmailCcInitialEntry[]>([]);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [defaultAttachmentIds, setDefaultAttachmentIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [loading, startLoading] = useTransition();
  const {
    error: inlineError,
    show: showInlineError,
    clear: clearInlineError,
    bubble,
  } = useInlineError();

  function handleClick() {
    clearInlineError();
    startLoading(async () => {
      // The body links the DD material, so the folder must resolve
      // before the composer opens. Same gate the sibling Share DD
      // Material row uses.
      const pre = await runPreflight({
        dealId,
        sourceItemId: itemId,
        required: ["ddFolderUrl"],
      });
      if (!pre.ok) {
        if (pre.kind === "missing") showInlineError(pre.message);
        else toast.error("Couldn't check this row. Try again.");
        return;
      }

      try {
        const [ctx, data, loiItemId] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getPsaKickoffComposerData({ dealId }),
          getSignLoiItemId({ dealId }),
        ]);

        if (data.to.length === 0) {
          // Three distinct causes, three distinct instructions. Telling
          // someone to "add an attorney" when one is already recorded
          // with a broken address sends them looking for the wrong thing.
          showInlineError(
            data.invalidEmail > 0
              ? "The PSA attorney on this deal has an email address that isn't valid. Fix it on the Consultants tab, then send."
              : data.missingEmail > 0
                ? "The PSA attorney on this deal has no email address. Add one on the Consultants tab, then send."
                : "No PSA attorney on this deal yet. Add one on the Consultants tab, then send.",
          );
          return;
        }

        // Executed LOI off the Phase 3 Sign LOI row, pre-checked when
        // there is one. Absence is not a gate: plenty of kickoffs happen
        // with the LOI circulated outside the platform.
        let loi: EmailAttachment[] = [];
        let loiDefaults: string[] = [];
        if (loiItemId) {
          const att = await getAttachmentsForItem({ itemId: loiItemId });
          loi = att.choices;
          loiDefaults = att.recommendedIds;
        }
        // The roster PDF lists BOTH sides' consultants, so shipping the
        // other side's engineering team to counsel is a judgement call.
        // Offered, never pre-checked.
        const roster: EmailAttachment = {
          id: "psa-consultant-roster",
          kind: "generated",
          generator: "consultant-roster",
          filename: "Consultant Roster.pdf",
        };
        setAttachments([...loi, roster]);
        setDefaultAttachmentIds(loiDefaults);

        // draftingNote is the third-person sentence naming who prepares
        // the first draft. Derived from the resolution rather than from
        // psa_drafting alone, so it degrades to side-neutral wording when
        // the roster cannot pin drafting to one firm.
        setVars({ ...ctx.vars, ...pre.resolved, draftingNote: data.draftingNote });
        setSenderOptions(ctx.senderOptions);
        setDefaultSenderId(ctx.defaultSenderId);

        setRecipients(
          data.to.map((r) => ({
            contactId: r.contactId,
            contactName: r.contactName,
            contactEmail: r.contactEmail,
            builderId: PSA_GROUP_ID,
            builderName: PSA_GROUP_LABEL,
            capLabel: r.capLabel,
            roleLabel: r.roleLabel,
          })),
        );
        setCcOptions(
          data.ccOptions.map((o) => ({
            id: o.id,
            name: o.name,
            email: o.email,
            group: o.group,
            capLabel: o.capLabel,
            roleLabel: o.roleLabel,
            disabled: o.disabled,
            disabledNote: o.disabledNote,
          })),
        );
        setCcInitial(
          data.defaultCcIds.length > 0
            ? [{ builderId: PSA_GROUP_ID, userIds: data.defaultCcIds }]
            : [],
        );

        // Every clause below is derived, not asserted. An earlier draft
        // promised "ownership and the brokerage are CC'd" unconditionally
        // and claimed the LOI was attached, both of which are false on a
        // deal with a thin roster or no uploaded LOI.
        const parts: string[] = [
          data.to.length === 1
            ? "One email to the PSA attorney."
            : `One email to ${data.to.length} PSA attorneys, both sides of the deal.`,
          data.draftingNote,
        ];
        if (data.defaultCcIds.length > 0) {
          parts.push("Ownership and the brokerage are CC'd.");
        } else {
          parts.push("Nobody is CC'd yet; add anyone who should be with the CC picker.");
        }
        if (loiDefaults.length === 0) {
          parts.push(
            "No executed LOI is on the Sign LOI row, so nothing is attached by default. The body references the LOI, so attach it or adjust the wording.",
          );
        }
        parts.push("Fill in the blank deal points before sending.");
        const skipped = data.missingEmail + data.invalidEmail;
        if (skipped > 0) {
          parts.push(
            `${skipped} other PSA attorney ${skipped === 1 ? "record has" : "records have"} no usable email address and ${skipped === 1 ? "was" : "were"} left off.`,
          );
        }
        setDescription(parts.join(" "));

        setOpen(true);
      } catch (err) {
        console.error("[psa-kickoff] context load failed", err);
        toast.error("Couldn't load recipients. Try again.");
      }
    });
  }

  return (
    <span className="relative inline-flex">
      {bubble}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Email the PSA attorney to start the purchase and sale agreement"
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
          loading && "opacity-60",
          inlineError && "ring-1 ring-red-300",
        )}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Scale className="h-3 w-3" />
        )}
        Notify PSA Attorney
      </button>

      <EmailPreviewModal
        open={open}
        onOpenChange={setOpen}
        title="Kick off PSA"
        description={description}
        recipients={recipients}
        template={PSA_KICKOFF_TEMPLATE}
        vars={vars}
        attachmentChoices={attachments}
        defaultSelectedAttachmentIds={defaultAttachmentIds}
        senderOptions={senderOptions}
        defaultSenderId={defaultSenderId}
        ccOptions={ccOptions}
        ccInitial={ccInitial}
        onSend={async (emails) => {
          // dealId is required for the kind:"generated" roster PDF.
          const result = await sendBlastEmails(emails, { dealId });
          if (result.failed === 0) {
            toast.success("PSA kickoff sent", { duration: 4000 });
          } else {
            const first = result.outcomes.find((o) => !o.ok);
            toast.error("Send failed", {
              description: first && !first.ok ? first.reason : "Check Resend logs.",
              duration: 8000,
            });
          }
        }}
      />
    </span>
  );
}
