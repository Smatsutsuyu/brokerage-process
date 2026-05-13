"use client";

import { useState, useTransition, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  EmailPreviewModal,
  type EmailAttachment,
  type EmailRecipient,
  type EmailSenderChoice,
} from "@/components/email/email-preview-modal";
import { cn } from "@/lib/utils";
import { type EmailTemplate } from "@/lib/email-templates";

import {
  getDealTeamRecipients,
  getOmBlastTemplateContext,
  type DealTeamRecipientGroup,
} from "../actions";

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
  // placeholders like ddFolderUrl, dueDate, etc.
  extraVars?: Record<string, string>;
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
  compact = true,
}: DealTeamSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>();
  const [loading, startLoading] = useTransition();

  function handleClick() {
    startLoading(async () => {
      try {
        // Parallel load: recipients (deal team) + composer context
        // (sender list + deal-info vars). Same shape OM-blast uses
        // since the function is generic despite its name.
        const [ctx, recs] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getDealTeamRecipients({ dealId, teams }),
        ]);
        setVars({ ...ctx.vars, ...(extraVars ?? {}) });
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
        setOpen(true);
      } catch (err) {
        console.error("[deal-team-send] context load failed", err);
        toast.error("Couldn't load recipients. Try again.");
      }
    });
  }

  return (
    <>
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
        onSend={async (emails) => {
          toast.success(
            `Mock-sent ${emails.length} ${emails.length === 1 ? "email" : "emails"}`,
            {
              description:
                "Email infrastructure isn't wired yet. No real messages were sent.",
              duration: 5000,
            },
          );
        }}
      />
    </>
  );
}
