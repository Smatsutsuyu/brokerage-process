"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  EmailPreviewBody,
  type EmailAttachment,
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
import { MARKETING_REPORT_DISTRIBUTION_TEMPLATE } from "@/lib/email-templates";

import {
  getDealTeamRecipients,
  getOmBlastTemplateContext,
  getOrgCcOptions,
  sendBlastEmails,
} from "../actions";

type SendMarketingReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
};

// Two-step send flow for the Phase 2 "Send Marketing Report" row:
//
//   Step 1 (preview): inline iframe of /api/deals/[id]/marketing-report.pdf
//                     so the user sees exactly what they're about to send.
//                     Cancel closes; Continue advances to step 2.
//
//   Step 2 (compose): EmailPreviewBody pre-populated with Owner Team
//                     recipients (To), CC picker stocked from the org
//                     user directory (Sean picks Loan + co-brokers each
//                     send), and a single non-toggleable attachment row
//                     advertising the generated Marketing Report PDF.
//
// The Inner component mounts fresh on every open so step + load state
// initialize via natural component lifecycle. Avoids the "reset state
// in effect" anti-pattern and gives us a fresh cache-busted PDF URL
// per open without explicit effect bookkeeping.
//
// The actual send is currently routed through sendBlastEmails (the
// existing stub). Real Resend wiring with a freshly-rendered PDF
// attachment lands once the landadvisors.com DNS verifies.
export function SendMarketingReportModal({
  open,
  onOpenChange,
  dealId,
}: SendMarketingReportModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[900px] w-[min(95vw,1100px)] max-w-none flex-col gap-3 sm:max-w-none">
        {open && (
          <Inner dealId={dealId} onClose={() => onOpenChange(false)} />
        )}
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
  const [loading, startLoading] = useTransition();
  const [contextLoaded, setContextLoaded] = useState(false);

  // PDF URL is fixed for this mount — Inner unmounts/remounts on each
  // open of the parent Dialog so the cache-bust naturally refreshes.
  // Lazy useState initializer keeps Date.now() out of the render path
  // (React 19 lint rule against impure calls during render).
  const [cacheBust] = useState(() => Date.now());
  const pdfUrl = useMemo(
    () => `/api/deals/${dealId}/marketing-report.pdf?t=${cacheBust}`,
    [dealId, cacheBust],
  );

  useEffect(() => {
    startLoading(async () => {
      try {
        const [ctx, recs, cc] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          getDealTeamRecipients({ dealId, teams: ["owner"] }),
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
        setCcOptions(cc.map((u) => ({ id: u.id, name: u.name, email: u.email })));
        setContextLoaded(true);
      } catch (err) {
        console.error("[send-marketing-report] context load failed", err);
        toast.error("Couldn't load recipients. Try again.");
        onClose();
      }
    });
  }, [dealId, onClose]);

  // Single attachment: a kind: "generated" entry that tells the blast
  // handler to render the Marketing Report PDF server-side at send
  // time and attach the bytes (not just a URL in the body).
  const attachmentChoices = useMemo<EmailAttachment[]>(
    () => [
      {
        id: "marketing-report-pdf",
        kind: "generated",
        generator: "marketing-report",
        filename: `${vars.dealName ?? "Marketing"} - Marketing Report.pdf`,
      },
    ],
    [vars.dealName],
  );

  if (step === "preview") {
    return (
      <PdfPreviewStep
        pdfUrl={pdfUrl}
        title="Marketing Report preview"
        description="Review the freshly-generated PDF before continuing to the email composer."
        continueLabel={loading ? "Loading recipients..." : "Continue to email"}
        continueDisabled={loading || !contextLoaded}
        onCancel={onClose}
        onContinue={() => setStep("compose")}
      />
    );
  }

  // Empty-state when no Owner Team members are configured (or none are
  // included in emails). EmailPreviewBody would render its own generic
  // "no recipients" message that mentions filters + adding emails to
  // contacts, which is wrong here — for this flow the right fix is to
  // populate the Owner Team on the Teams tab. Custom CTA points there.
  if (contextLoaded && recipients.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send Marketing Report</DialogTitle>
          <DialogDescription>
            No Owner Team members are set up to receive this email.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <Users className="h-10 w-10 text-gray-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">
              No Owner Team for this deal
            </p>
            <p className="max-w-md text-[13px] text-gray-600">
              The Marketing Report goes to the Owner Team. Add at least one
              Owner Team member with an email (and the Include in emails
              toggle on) before sending.
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
        <DialogTitle>Send Marketing Report</DialogTitle>
        <DialogDescription>
          Compose the email that will go to the Owner Team with the Marketing Report
          attached.
        </DialogDescription>
      </DialogHeader>
      {!contextLoaded ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading recipients...
        </div>
      ) : (
        <>
          {/* Visible cue that this send targets the Owner Team. The
              EmailPreviewBody's per-builder paginator below also shows
              "Owner Team" as the group label, but a banner up front is
              clearer than relying on the paginator chrome alone.
              mt-4 pushes it below the dialog's X close button (which
              sits at top-4 right-4) so they don't overlap. */}
          <div className="mt-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
            <Users className="h-3.5 w-3.5 flex-shrink-0 text-blue-700" />
            <span>
              Sending to the <strong>Owner Team</strong> for this deal (
              {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
              ). Manage who&apos;s included on the{" "}
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
          title="Send Marketing Report"
          description="One email to the Owner Team. Edit the subject or body before sending; the Marketing Report PDF is attached automatically."
          recipients={recipients}
          template={MARKETING_REPORT_DISTRIBUTION_TEMPLATE}
          vars={vars}
          attachmentChoices={attachmentChoices}
          defaultSelectedAttachmentIds={["marketing-report-pdf"]}
          senderOptions={senderOptions}
          defaultSenderId={defaultSenderId}
          ccOptions={ccOptions}
          onClose={onClose}
          onBack={() => setStep("preview")}
          onSend={async (emails) => {
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
              // dealId required because the marketing-report generator
              // needs to know which deal to render.
              { dealId },
            );
            if (result.failed === 0) {
              toast.success(
                `Sent Marketing Report (${result.sent} email${result.sent === 1 ? "" : "s"}).`,
              );
            } else {
              toast.warning(
                `Sent ${result.sent}, failed ${result.failed}. Check console for details.`,
              );
              for (const o of result.outcomes) {
                if (!o.ok) console.warn(`[marketing-report send] ${o.builderName}: ${o.reason}`);
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
