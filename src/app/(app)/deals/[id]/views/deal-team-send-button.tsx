"use client";

import { useState, useTransition, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
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
import { resolveDefaultCcUserIds } from "@/lib/email/default-cc";
import { cn } from "@/lib/utils";
import { type EmailTemplate } from "@/lib/email-templates";

import {
  getDealTeamRecipients,
  getOmBlastTemplateContext,
  getOrgCcOptions,
  sendBlastEmails,
  type DealTeamRecipientGroup,
} from "../actions";
import { runPreflight, type RequirableVar } from "./deal-team-preflight";

type DealTeamSendButtonProps = {
  dealId: string;
  // Button label (e.g. "Send to Deal Team", "Send roster").
  label: string;
  // Tooltip on hover.
  title?: string;
  // Visible icon.
  icon: ComponentType<{ className?: string }>;
  // Title shown in the preview modal header (e.g. "Issues report", "Consultant roster").
  modalTitle: string;
  // The email template applied to every per-team email.
  template: EmailTemplate;
  // Sub-teams whose included-in-emails members should be recipients.
  // The modal groups by sub-team so each (Owner Team / Broker Team /
  // Buyer Team) shows up as one "email" in the paginator.
  teams: DealTeamRecipientGroup[];
  // Attachments to include in the email (offered as checkboxes in the
  // preview). All are pre-selected by default. Pass [] for none.
  attachments: EmailAttachment[];
  // Extra vars layered onto the deal context vars (dealName/city/units/
  // type/senderName) at compose time. Use for template-specific
  // placeholders the caller already has on hand. Vars listed in
  // `requireVars` are resolved automatically and don't belong here.
  extraVars?: Record<string, string>;
  // Template placeholders that must resolve to a real value before the
  // composer will open. Resolved server-side on click; any that come
  // back empty block the open and surface an inline rejection bubble
  // anchored to the button.
  requireVars?: RequirableVar[];
  // The checklist row this button renders on. Used by the ddFolderUrl
  // lookup as its first source (a link pasted on this row wins over the
  // canonical DD Dropbox Folder row).
  sourceItemId?: string | null;
  compact?: boolean;
};

// Generic "Send to Deal Team" button. Click → loads recipients +
// template context → opens EmailPreviewModal with everything wired
// (sender picker, attachments pre-selected, recipients grouped per
// sub-team). Mock-sends via toast for now since the Resend pipeline
// isn't live yet.
//
// Used on Phase 3/4 checklist rows whose Excel functionality is "send
// the X to the deal team": Issues PDF, Consultant Roster, Share DD
// Material, Schedule SOO Review, etc. Each call site configures the
// template, teams, and attachments; the loading + preview UX stays
// uniform.
export function DealTeamSendButton({
  dealId,
  label,
  title,
  icon: Icon,
  modalTitle,
  template,
  teams,
  attachments,
  extraVars,
  requireVars,
  sourceItemId,
  compact = true,
}: DealTeamSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>();
  const [ccOptions, setCcOptions] = useState<EmailCcUserOption[]>([]);
  const [ccInitial, setCcInitial] = useState<EmailCcInitialEntry[]>([]);
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
      // Pre-flight every required var before touching the composer.
      // Distinct copy from the recipient-load failure below so a bug
      // report points at the right step.
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
      const resolved = pre.resolved;

      try {
        // Parallel load: recipients (deal team) + composer context
        // (sender list + deal-info vars). Same shape OM-blast uses
        // since the function is generic despite its name.
        const [ctx, recs, cc] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getDealTeamRecipients({ dealId, teams }),
          getOrgCcOptions(),
        ]);
        setVars({ ...ctx.vars, ...resolved, ...(extraVars ?? {}) });
        setSenderOptions(ctx.senderOptions);
        setDefaultSenderId(ctx.defaultSenderId);
        setRecipients(
          recs.map((r) => ({
            contactId: r.contactId,
            contactName: r.contactName,
            contactEmail: r.contactEmail,
            builderId: r.builderId,
            builderName: r.builderName,
          })),
        );

        // CC picker, stocked from the org directory with the marketing
        // coordinator pre-checked. Recipients are grouped one email per
        // sub-team (builderId is the team key), so seed the default once
        // per group that actually has members. No onCcChange is passed:
        // the selection is per-send only, never persisted, and the user
        // can uncheck it in the composer.
        setCcOptions(cc.map((u) => ({ id: u.id, name: u.name, email: u.email })));
        const defaultCcIds = resolveDefaultCcUserIds(cc);
        const groupIds = [...new Set(recs.map((r) => r.builderId))];
        setCcInitial(
          defaultCcIds.length > 0
            ? groupIds.map((builderId) => ({ builderId, userIds: defaultCcIds }))
            : [],
        );

        setOpen(true);
      } catch (err) {
        console.error("[deal-team-send] context load failed", err);
        // Network/server errors go through sonner — not the user's
        // fault and not tied to the row's data state.
        toast.error("Couldn't load recipients. Try again.");
      }
    });
  }

  const errorRing = inlineError ? "ring-1 ring-red-300" : undefined;

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

      <EmailPreviewModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        recipients={recipients}
        template={template}
        vars={vars}
        attachmentChoices={attachments}
        defaultSelectedAttachmentIds={attachments.map((a) => a.id)}
        senderOptions={senderOptions}
        defaultSenderId={defaultSenderId}
        ccOptions={ccOptions}
        ccInitial={ccInitial}
        onSend={async (emails) => {
          const result = await sendBlastEmails(emails);
          if (result.failed === 0) {
            toast.success(
              `Sent ${result.sent} ${result.sent === 1 ? "email" : "emails"}`,
              { duration: 4000 },
            );
          } else if (result.sent === 0) {
            const first = result.outcomes.find((o) => !o.ok);
            toast.error(
              `Send failed for all ${result.failed} ${result.failed === 1 ? "email" : "emails"}`,
              {
                description: first && !first.ok ? first.reason : "Check Resend logs.",
                duration: 8000,
              },
            );
          } else {
            const failed = result.outcomes.filter((o) => !o.ok);
            toast.warning(`Sent ${result.sent}, failed ${result.failed}`, {
              description: failed
                .map((f) => `${f.builderName}: ${"reason" in f ? f.reason : ""}`)
                .join("; "),
              duration: 10000,
            });
          }
        }}
      />
    </span>
  );
}
