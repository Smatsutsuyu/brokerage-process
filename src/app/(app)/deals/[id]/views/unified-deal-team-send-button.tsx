"use client";

import { useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  EmailPreviewBody,
  EmailPreviewModal,
  type EmailAttachment,
  type EmailCcInitialEntry,
  type EmailCcUserOption,
  type EmailRecipient,
  type EmailSenderChoice,
} from "@/components/email/email-preview-modal";
import { useInlineError } from "@/components/inline-error-bubble";
import { PdfPreviewStep } from "@/components/pdf/pdf-preview-step";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type EmailTemplate } from "@/lib/email-templates";

import {
  getOmBlastTemplateContext,
  getUnifiedDealTeamComposerData,
  sendBlastEmails,
} from "../actions";
import { runPreflight, type RequirableVar } from "./deal-team-preflight";

// Single synthetic group id. The composer groups recipients by
// `builderId` and renders one email per group; feeding it one id
// collapses ownership + buyer into a single outbound email, which is the
// whole point of this variant.
const UNIFIED_GROUP_ID = "deal-team";
const UNIFIED_GROUP_LABEL = "Deal Team";

type UnifiedDealTeamSendButtonProps = {
  dealId: string;
  label: string;
  title?: string;
  icon: ComponentType<{ className?: string }>;
  modalTitle: string;
  template: EmailTemplate;
  attachments: EmailAttachment[];
  extraVars?: Record<string, string>;
  requireVars?: RequirableVar[];
  sourceItemId?: string | null;
  // Offer the deal's consultants in the CC picker. On by default. Turn
  // off for a send where copying the other side of the table would be
  // wrong.
  includeConsultants?: boolean;
  // When set, the flow becomes two-step: review the freshly-rendered PDF
  // first, then continue to the composer with it already attached. Same
  // shape as the Marketing Report / Consultant Roster / Deal Status
  // sends. Omit on rows with nothing to preview (Share DD Material ships
  // a folder link in the body, not a document).
  //
  // `path` is the route only; the cache-busting query is appended at
  // click time so each open renders current data rather than a cached
  // response from the last preview.
  previewPdf?: { path: string; title: string; description?: string };
  compact?: boolean;
};

// "Send to Deal Team", unified variant: ONE email with a proper To/CC
// split instead of one email per sub-team.
//
//   To:  Owner Team + Buyer Team
//   CC:  Broker Team (pre-checked) + marketing coordinator, and
//        optionally the deal's consultants, grouped by side
//
// Deliberately a separate component from DealTeamSendButton rather than
// a flag on it, so this is opt-in per checklist row and reverting a row
// is swapping which component it renders. The two share the pre-flight
// (./deal-team-preflight) and the composer (EmailPreviewModal); the
// provenance props they feed the composer are optional there, so the
// per-sub-team button's chips are unchanged.
//
// Why this shape at all: the composer groups on `builderId`, and for the
// per-sub-team button that key IS the sub-team, so one email always
// equalled one team and the paginator header named it. Chris read that
// as "it only sends to ownership". Collapsing fixes the send shape but
// removes the header that used to disambiguate, which is why every chip
// here carries its own provenance cap.
export function UnifiedDealTeamSendButton({
  dealId,
  label,
  title,
  icon: Icon,
  modalTitle,
  template,
  attachments,
  extraVars,
  requireVars,
  sourceItemId,
  includeConsultants = true,
  previewPdf,
  compact = true,
}: UnifiedDealTeamSendButtonProps) {
  const [open, setOpen] = useState(false);
  // Only meaningful when previewPdf is set. Reset to "preview" on every
  // open so reopening never lands mid-flow.
  const [step, setStep] = useState<"preview" | "compose">("preview");
  const [pdfUrl, setPdfUrl] = useState("");
  const [toCount, setToCount] = useState(0);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>();
  const [ccOptions, setCcOptions] = useState<EmailCcUserOption[]>([]);
  const [ccInitial, setCcInitial] = useState<EmailCcInitialEntry[]>([]);
  const [description, setDescription] = useState<string>("");
  // Snapshotted at open rather than derived inline in JSX. Call sites
  // pass `attachments={[...]}` as a fresh array literal every render, so
  // an inline `attachments.map(a => a.id)` is a new array identity each
  // time — and it feeds the composer's seed effect, which would then
  // re-run and wipe the user's attachment, sender and CC selections on
  // any parent re-render while the modal is open.
  const [defaultAttachmentIds, setDefaultAttachmentIds] = useState<string[]>([]);
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
      const pre = await runPreflight({
        dealId,
        sourceItemId,
        required: requireVars ?? [],
      });
      if (!pre.ok) {
        if (pre.kind === "missing") showInlineError(pre.message);
        else toast.error("Couldn't check this row. Try again.");
        return;
      }

      try {
        const [ctx, data] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getUnifiedDealTeamComposerData({ dealId, includeConsultants }),
        ]);

        // Nobody addressable: reject at click time with the inline
        // bubble instead of opening a composer whose Send is disabled and
        // whose empty-state copy talks about filters this modal doesn't
        // have. Same affordance the requireVars gate uses.
        if (data.to.length === 0) {
          showInlineError(
            data.toWithoutEmail > 0
              ? "Nobody on this deal team has an email address. Add one on the Deal Team tab, then send."
              : "No deal team members to send to. Add them on the Deal Team tab, then send.",
          );
          return;
        }

        setVars({ ...ctx.vars, ...pre.resolved, ...(extraVars ?? {}) });
        setSenderOptions(ctx.senderOptions);
        setDefaultSenderId(ctx.defaultSenderId);
        setDefaultAttachmentIds(attachments.map((a) => a.id));
        setToCount(data.to.length);
        // Everything is loaded before the dialog opens, so the preview
        // step's Continue is live immediately rather than waiting on a
        // recipient fetch the way the sibling two-step modals do.
        setStep("preview");
        if (previewPdf) {
          setPdfUrl(`${previewPdf.path}?t=${Date.now()}`);
        }

        // Every To recipient shares the one synthetic group so the
        // composer emits exactly one email. Their real provenance rides
        // on the chip instead of on the group header.
        setRecipients(
          data.to.map((r) => ({
            contactId: r.contactId,
            contactName: r.contactName,
            contactEmail: r.contactEmail,
            builderId: UNIFIED_GROUP_ID,
            builderName: UNIFIED_GROUP_LABEL,
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
        // Ephemeral: no onCcChange is passed, so the selection is
        // per-send only and never persisted.
        setCcInitial(
          data.defaultCcIds.length > 0
            ? [{ builderId: UNIFIED_GROUP_ID, userIds: data.defaultCcIds }]
            : [],
        );

        // Overrides the composer's default "one email per builder" copy,
        // which is wrong for this flow and is plausibly part of what told
        // Chris the tool was doing something it wasn't.
        const n = data.toWithoutEmail;
        const skipped =
          n > 0
            ? ` ${n} deal team ${n === 1 ? "member has" : "members have"} no email address on file and ${
                n === 1 ? "was" : "were"
              } left off — add ${n === 1 ? "an address" : "addresses"} on the Deal Team tab to include ${
                n === 1 ? "them" : "them"
              }.`
            : "";
        setDescription(
          (data.brokerIsRecipient
            ? "One email to the Deal Team. Nobody on ownership or the buyer side has an email address yet, so this goes to the brokerage."
            : "One email to the Deal Team. Ownership and the buyer are on the To line; the brokerage is CC'd.") +
            " Each name is tagged with the team or consultant side it comes from." +
            skipped,
        );

        setOpen(true);
      } catch (err) {
        console.error("[unified-deal-team-send] context load failed", err);
        toast.error("Couldn't load recipients. Try again.");
      }
    });
  }

  const errorRing = inlineError ? "ring-1 ring-red-300" : undefined;

  async function handleSend(emails: Parameters<typeof sendBlastEmails>[0]) {
    // dealId is required by the transport to render any kind:"generated"
    // attachment (the DD Tracking report rides through here).
    const result = await sendBlastEmails(emails, { dealId });
    if (result.failed === 0) {
      toast.success(`Sent ${result.sent} ${result.sent === 1 ? "email" : "emails"}`, {
        duration: 4000,
      });
    } else if (result.sent === 0) {
      const first = result.outcomes.find((o) => !o.ok);
      toast.error("Send failed", {
        description: first && !first.ok ? first.reason : "Check Resend logs.",
        duration: 8000,
      });
    } else {
      const failed = result.outcomes.filter((o) => !o.ok);
      toast.warning(`Sent ${result.sent}, failed ${result.failed}`, {
        description: failed
          .map((f) => `${f.builderName}: ${"reason" in f ? f.reason : ""}`)
          .join("; "),
        duration: 10000,
      });
    }
  }

  // Shared by both presentations so the single-step and two-step flows
  // can never drift in what they actually compose.
  const composerProps = {
    title: modalTitle,
    description,
    recipients,
    template,
    vars,
    attachmentChoices: attachments,
    defaultSelectedAttachmentIds: defaultAttachmentIds,
    senderOptions,
    defaultSenderId,
    ccOptions,
    ccInitial,
    onSend: handleSend,
  };

  return (
    <span className="relative inline-flex">
      {bubble}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={title ?? label}
        className={cn(
          compact
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50",
          loading && "opacity-60",
          errorRing,
        )}
      >
        {loading ? (
          <Loader2 className={compact ? "h-3 w-3 animate-spin" : "h-3.5 w-3.5 animate-spin"} />
        ) : (
          <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        )}
        {label}
      </button>

      {previewPdf ? (
        // Two-step: review the freshly-rendered PDF, then compose with it
        // attached. Same shape as the Marketing Report / Consultant
        // Roster / Deal Status sends.
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex h-[85vh] max-h-[900px] w-[min(95vw,1100px)] max-w-none flex-col gap-3 sm:max-w-none">
            {step === "preview" ? (
              <PdfPreviewStep
                pdfUrl={pdfUrl}
                title={previewPdf.title}
                description={previewPdf.description}
                continueLabel="Continue to email"
                onCancel={() => setOpen(false)}
                onContinue={() => setStep("compose")}
              />
            ) : (
              <>
                <DialogHeader className="sr-only">
                  <DialogTitle>{modalTitle}</DialogTitle>
                  <DialogDescription>
                    Compose the email that will go to the Deal Team with the
                    report attached.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
                  <Users className="h-3.5 w-3.5 flex-shrink-0 text-blue-700" />
                  <span>
                    One email to <strong>{toCount}</strong> recipient
                    {toCount === 1 ? "" : "s"} on the Deal Team, plus anyone
                    CC&apos;d. Manage who&apos;s included on the{" "}
                    <Link
                      href={`/deals/${dealId}?tab=team`}
                      className="underline hover:text-blue-700"
                      onClick={() => setOpen(false)}
                    >
                      Teams tab
                    </Link>
                    .
                  </span>
                </div>
                {/* DialogContent has no overflow handling of its own, and
                    this one is a fixed h-[85vh]. The composer runs taller
                    here than in the sibling two-step modals (provenance
                    chips wrap, and each recipient box carries a summary
                    line), so on a short laptop viewport the footer would
                    be clipped with no way to scroll to Send. Scrolling the
                    whole body keeps every control reachable. */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <EmailPreviewBody
                    {...composerProps}
                    onClose={() => setOpen(false)}
                    onBack={() => setStep("preview")}
                  />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      ) : (
        <EmailPreviewModal open={open} onOpenChange={setOpen} {...composerProps} />
      )}
    </span>
  );
}
