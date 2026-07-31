"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  EmailPreviewBody,
  type EmailAttachment,
  type EmailCcInitialEntry,
  type EmailCcUserOption,
  type EmailRecipient,
  type EmailSenderChoice,
} from "@/components/email/email-preview-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfPreviewStep } from "@/components/pdf/pdf-preview-step";
import { resolveDefaultCcUserIds } from "@/lib/email/default-cc";
import { CONSULTANT_ROSTER_TEMPLATE } from "@/lib/email-templates";

import {
  getDealTeamRecipients,
  getOmBlastTemplateContext,
  getOrgCcOptions,
  sendBlastEmails,
} from "../actions";

type SendConsultantRosterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
};

// Two-step Consultant Roster send flow. Sibling of SendDealStatusModal:
//
//   Step 1 (preview): iframe of /api/deals/[id]/consultant-roster.pdf so
//                     the user sees the roster that's about to go out.
//
//   Step 2 (compose): EmailPreviewBody with Deal Team recipients grouped
//                     one email per sub-team (Owner / Broker / Buyer),
//                     the org CC picker with the marketing coordinator
//                     pre-checked, and one kind:"generated" attachment
//                     pointing at the consultant-roster generator.
//
// This replaced a Send-to-Deal-Team button that attached nothing at all
// while the template body said "attached is the consultant roster".
export function SendConsultantRosterModal({
  open,
  onOpenChange,
  dealId,
}: SendConsultantRosterModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[900px] w-[min(95vw,1100px)] max-w-none flex-col gap-3 sm:max-w-none">
        {open && <Inner dealId={dealId} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type InnerProps = {
  dealId: string;
  onClose: () => void;
};

function Inner({ dealId, onClose }: InnerProps) {
  const [step, setStep] = useState<"preview" | "compose">("preview");
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>(undefined);
  const [ccOptions, setCcOptions] = useState<EmailCcUserOption[]>([]);
  const [ccInitial, setCcInitial] = useState<EmailCcInitialEntry[]>([]);
  const [loading, startLoading] = useTransition();
  const [contextLoaded, setContextLoaded] = useState(false);

  const [cacheBust] = useState(() => Date.now());
  const pdfUrl = useMemo(
    () => `/api/deals/${dealId}/consultant-roster.pdf?t=${cacheBust}`,
    [dealId, cacheBust],
  );

  useEffect(() => {
    startLoading(async () => {
      try {
        const [ctx, recs, cc] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getDealTeamRecipients({ dealId, teams: ["owner", "broker", "buyer"] }),
          getOrgCcOptions(),
        ]);
        setVars(ctx.vars);
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

        // Marketing coordinator pre-checked, same as the generic Deal
        // Team send. Recipients are grouped one email per sub-team
        // (builderId is the team key), so seed the default once per
        // group that actually has members. Ephemeral — no onCcChange,
        // so the selection is per-send only.
        setCcOptions(cc.map((u) => ({ id: u.id, name: u.name, email: u.email })));
        const defaultCcIds = resolveDefaultCcUserIds(cc);
        const groupIds = [...new Set(recs.map((r) => r.builderId))];
        setCcInitial(
          defaultCcIds.length > 0
            ? groupIds.map((builderId) => ({ builderId, userIds: defaultCcIds }))
            : [],
        );

        setContextLoaded(true);
      } catch (err) {
        console.error("[send-consultant-roster] context load failed", err);
        toast.error("Couldn't load recipients. Try again.");
        onClose();
      }
    });
  }, [dealId, onClose]);

  const attachmentChoices = useMemo<EmailAttachment[]>(
    () => [
      {
        id: "consultant-roster-pdf",
        kind: "generated",
        generator: "consultant-roster",
        filename: `${vars.dealName ?? "Deal"} - Consultant Roster.pdf`,
      },
    ],
    [vars.dealName],
  );

  if (step === "preview") {
    return (
      <PdfPreviewStep
        pdfUrl={pdfUrl}
        title="Consultant Roster preview"
        description="Review the freshly-generated roster before continuing to the email composer."
        continueLabel={loading ? "Loading recipients..." : "Continue to email"}
        continueDisabled={loading || !contextLoaded}
        onCancel={onClose}
        onContinue={() => setStep("compose")}
      />
    );
  }

  if (contextLoaded && recipients.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send consultant roster</DialogTitle>
          <DialogDescription>
            No Deal Team members are set up to receive this email.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <Users className="h-10 w-10 text-gray-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">
              No Deal Team for this deal
            </p>
            <p className="max-w-md text-[13px] text-gray-600">
              The roster goes to the Owner, Broker, and Buyer teams. Add at
              least one member with an email (and the Include in emails toggle
              on) before sending.
            </p>
          </div>
          <Link
            href={`/deals/${dealId}?tab=team`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            <Users className="h-3.5 w-3.5" />
            Open Teams tab
          </Link>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("preview")}>
            Back
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>Send consultant roster</DialogTitle>
        <DialogDescription>
          Compose the email that will go to the Deal Team with the Consultant
          Roster attached.
        </DialogDescription>
      </DialogHeader>
      {!contextLoaded ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading recipients...
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
            <Users className="h-3.5 w-3.5 flex-shrink-0 text-blue-700" />
            <span>
              Sending to the <strong>Deal Team</strong> for this deal (
              {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
              ), one email per sub-team. Manage who&apos;s included on the{" "}
              <Link
                href={`/deals/${dealId}?tab=team`}
                className="underline hover:text-blue-700"
                onClick={onClose}
              >
                Teams tab
              </Link>
              .
            </span>
          </div>
          <EmailPreviewBody
            title="Consultant roster"
            description="One email per sub-team. Edit the subject or body before sending; the Consultant Roster PDF is attached automatically."
            recipients={recipients}
            template={CONSULTANT_ROSTER_TEMPLATE}
            vars={vars}
            attachmentChoices={attachmentChoices}
            defaultSelectedAttachmentIds={["consultant-roster-pdf"]}
            senderOptions={senderOptions}
            defaultSenderId={defaultSenderId}
            ccOptions={ccOptions}
            ccInitial={ccInitial}
            onClose={onClose}
            onBack={() => setStep("preview")}
            onSend={async (emails) => {
              // dealId is required here: the roster attachment is
              // kind: "generated", so the send path re-renders it
              // server-side and needs to know which deal.
              const result = await sendBlastEmails(
                emails.map((e) => ({
                  builderId: e.builderId,
                  builderName: e.builderName,
                  to: e.to,
                  cc: e.cc,
                  from: e.from,
                  subject: e.subject,
                  body: e.body,
                  attachments: e.attachments,
                })),
                { dealId },
              );
              if (result.failed === 0) {
                toast.success(
                  `Sent Consultant Roster (${result.sent} email${result.sent === 1 ? "" : "s"}).`,
                );
              } else {
                toast.warning(
                  `Sent ${result.sent}, failed ${result.failed}. Check console for details.`,
                );
                for (const o of result.outcomes) {
                  if (!o.ok) {
                    console.warn(`[consultant-roster send] ${o.builderName}: ${o.reason}`);
                  }
                }
              }
              onClose();
            }}
          />
        </>
      )}
    </>
  );
}
