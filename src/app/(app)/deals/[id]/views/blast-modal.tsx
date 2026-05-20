"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight, Building2, Loader2, Mail } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type EmailTemplate } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

import {
  getAttachmentsForItem,
  getCcSelectionsForBuilders,
  getOmBlastTemplateContext,
  getOrgCcOptions,
  previewBlastRecipients,
  sendBlastEmails,
  setBuilderCcUsers,
  type BlastPreviewRow,
} from "../actions";
import type { LeadOption } from "./lead-picker";

type Tier = "green" | "yellow" | "red" | "not_selected";

const TIER_META: Record<Tier, { label: string; chip: string; dot: string }> = {
  green: {
    label: "Interested (Green)",
    chip: "bg-green-100 text-green-800 border-green-300",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating (Yellow)",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Passed (Red)",
    chip: "bg-red-100 text-red-800 border-red-300",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    dot: "bg-gray-400",
  },
};

const TIERS: Tier[] = ["green", "yellow", "red", "not_selected"];

// Sentinel for the "Anyone" assignee filter (no leadUser filter applied).
const ANY_ASSIGNEE = "__any__";

type BlastModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  leadOptions: LeadOption[];
  // The email template applied to every per-builder email. Caller
  // configures this per send: OM_BLAST_TEMPLATE, QA_FILE_TEMPLATE, etc.
  template: EmailTemplate;
  // Title shown in the modal header (Step 1) AND the preview modal
  // header (Step 2). Step 1 prefixes with "Send", Step 2 doesn't.
  title: string;
  // Default tier selection. OM and most others default to ["green",
  // "yellow"]; In-Person Meeting defaults to ["green"] only;
  // Confidentiality Agreement defaults to all tiers.
  defaultTiers: Tier[];
  // Optional checklist item to pull attachments from. When set,
  // attachments are loaded via getAttachmentsForItem on Step 2 open.
  // Pass the OM Phase 1 item id for OM blast; the row's own item id
  // for Q&A / Market Study where files live on the row itself.
  attachmentSourceItemId?: string | null;
  // Filter recipients to exclude builders whose offer_received_at is
  // set. Used by the "Follow up Missing Offers" send.
  excludeOfferReceived?: boolean;
};

// Generic two-step blast composer. Step 1: tier filter + lead-assignee
// filter + live recipient preview. Step 2: per-builder email preview
// with sender / CC / attachment pickers. Mock-sends via toast pending
// the Resend domain verification.
//
// Originally OM-specific; now configurable so every Phase 2 send to
// buyers (CA, Q&A, Market Study, reminders, follow-ups, etc.) can
// reuse the same UX. Per-row wrappers (OmBlastButton, etc.) supply
// the template + tier defaults + attachment source.
export function BlastModal({
  open,
  onOpenChange,
  dealId,
  leadOptions,
  template,
  title,
  defaultTiers,
  attachmentSourceItemId,
  excludeOfferReceived,
}: BlastModalProps) {
  const [step, setStep] = useState<"filter" | "preview">("filter");
  const [selectedTiers, setSelectedTiers] = useState<Set<Tier>>(
    () => new Set(defaultTiers),
  );
  const [assigneeChoice, setAssigneeChoice] = useState<string>(ANY_ASSIGNEE);
  const [recipients, setRecipients] = useState<BlastPreviewRow[]>([]);
  // Per-contact opt-out for the current filter result. Defaults empty
  // (everyone checked); user can deselect individuals from the recipient
  // preview without changing the tier/lead filters.
  const [excludedContactIds, setExcludedContactIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, startLoading] = useTransition();
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [attachmentChoices, setAttachmentChoices] = useState<EmailAttachment[]>([]);
  const [defaultAttachmentIds, setDefaultAttachmentIds] = useState<string[]>([]);
  const [senderOptions, setSenderOptions] = useState<EmailSenderChoice[]>([]);
  const [defaultSenderId, setDefaultSenderId] = useState<string | undefined>();
  const [ccOptions, setCcOptions] = useState<EmailCcUserOption[]>([]);
  const [ccInitial, setCcInitial] = useState<EmailCcInitialEntry[]>([]);
  const [previewLoading, startPreviewLoading] = useTransition();

  // Reset to step 1 each time the modal opens. Without this, reopening
  // after a previous step-2 visit would land back on the preview pane.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setStep("filter");
  }, [open]);

  // Recompute the preview whenever filters change OR the modal opens.
  // useEffect rather than onChange so the recompute is debounced naturally
  // by React's batching and survives transient closes/reopens.
  useEffect(() => {
    if (!open) return;
    const tiers = Array.from(selectedTiers);
    if (tiers.length === 0) {
      setRecipients([]);
      return;
    }
    startLoading(async () => {
      try {
        const rows = await previewBlastRecipients({
          dealId,
          tiers,
          assigneeUserId: assigneeChoice === ANY_ASSIGNEE ? null : assigneeChoice,
          excludeOfferReceived,
        });
        setRecipients(rows);
      } catch (err) {
        console.error("[blast] preview failed", err);
        setRecipients([]);
      }
    });
  }, [open, dealId, selectedTiers, assigneeChoice, excludeOfferReceived]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleTier(t: Tier) {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Per-contact checkbox. Tracked as the *excluded* set so the default
  // (empty set) means "everyone checked." Toggling adds/removes a single
  // contactId.
  function toggleContact(contactId: string) {
    setExcludedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  // Builder-level "select all / deselect all" — only affects the
  // builder's emailable contacts. If any are currently checked, the
  // action excludes them all; otherwise it un-excludes them all.
  function toggleBuilder(builderContactIds: string[]) {
    setExcludedContactIds((prev) => {
      const next = new Set(prev);
      const anyChecked = builderContactIds.some((id) => !next.has(id));
      if (anyChecked) {
        for (const id of builderContactIds) next.add(id);
      } else {
        for (const id of builderContactIds) next.delete(id);
      }
      return next;
    });
  }

  const assigneeLabel = useMemo(() => {
    if (assigneeChoice === ANY_ASSIGNEE) return "Anyone (no filter)";
    return leadOptions.find((u) => u.id === assigneeChoice)?.name ?? "Pick an assignee";
  }, [assigneeChoice, leadOptions]);

  // Group preview rows by builder for readability. Preserve the server's
  // sort order (alphabetical builder, alphabetical contact within).
  const grouped = useMemo(() => {
    const map = new Map<string, { builderName: string; contacts: BlastPreviewRow[] }>();
    for (const r of recipients) {
      let g = map.get(r.builderId);
      if (!g) {
        g = { builderName: r.builderName, contacts: [] };
        map.set(r.builderId, g);
      }
      g.contacts.push(r);
    }
    return Array.from(map.values());
  }, [recipients]);

  const recipientCount = recipients.length;
  const recipientsWithEmail = recipients.filter((r) => r.contactEmail).length;
  // Checked contacts with an email — the actual send set after the user
  // applies any per-contact opt-outs in the recipients list.
  const checkedWithEmail = useMemo(
    () =>
      recipients.filter(
        (r) => r.contactEmail && !excludedContactIds.has(r.contactId),
      ),
    [recipients, excludedContactIds],
  );
  // Email count = unique builders among the checked-with-email set since
  // each builder gets one email with multiple To: addresses (matches the
  // preview modal's grouping).
  const emailCount = useMemo(() => {
    const builders = new Set<string>();
    for (const r of checkedWithEmail) builders.add(r.builderId);
    return builders.size;
  }, [checkedWithEmail]);

  // Hand off to step 2: load the deal's template vars (deal name, city,
  // units, type, sender first name), every OM attachment option, sender
  // options (Chris + current user), the org-wide CC pool, and per-builder
  // CC selections — all in parallel — then flip step to "preview". Step
  // 2 lives in the same Dialog as step 1; clicking Back goes back here.
  function handleProceedToPreview() {
    // Builder ids in the *checked* recipient set — used to scope the CC
    // selection lookup to just the builders we'd actually email.
    const builderIds = Array.from(new Set(checkedWithEmail.map((r) => r.builderId)));
    startPreviewLoading(async () => {
      try {
        const [ctx, att, ccOpts, ccSelections] = await Promise.all([
          getOmBlastTemplateContext({ dealId }),
          // Optional attachment source. When the caller didn't provide
          // one, skip the load and pass empty arrays to the modal so
          // the attachments section is hidden.
          attachmentSourceItemId
            ? getAttachmentsForItem({ itemId: attachmentSourceItemId })
            : Promise.resolve({ choices: [], recommendedIds: [] }),
          getOrgCcOptions(),
          builderIds.length > 0
            ? getCcSelectionsForBuilders({ dealId, builderIds })
            : Promise.resolve([] as EmailCcInitialEntry[]),
        ]);
        setPreviewVars(ctx.vars);
        setAttachmentChoices(att.choices);
        setDefaultAttachmentIds(att.recommendedIds);
        setSenderOptions(ctx.senderOptions);
        setDefaultSenderId(ctx.defaultSenderId);
        setCcOptions(ccOpts);
        setCcInitial(ccSelections);
        setStep("preview");
      } catch (err) {
        console.error("[blast] preview context load failed", err);
      }
    });
  }

  // Recipients passed to step 2 = checked contacts with an email,
  // mapped into the shape EmailPreviewBody expects.
  const previewRecipients = useMemo<EmailRecipient[]>(
    () =>
      checkedWithEmail.map((r) => ({
        contactId: r.contactId,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        builderId: r.builderId,
        builderName: r.builderName,
      })),
    [checkedWithEmail],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {step === "filter" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send {title}</DialogTitle>
              <DialogDescription>
                Filter by tier and (optionally) lead assignee. Contacts marked
                &ldquo;does not receive communication&rdquo; are excluded automatically.
                Uncheck individual recipients below if you want to skip them.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Tier multi-select */}
              <div className="space-y-2">
                <Label>Tiers</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TIERS.map((t) => {
                    const meta = TIER_META[t];
                    const active = selectedTiers.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTier(t)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                          active
                            ? meta.chip
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                        )}
                      >
                        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", meta.dot)} />
                        <span className="flex-1">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assigned-to filter */}
              <div className="grid gap-2">
                <Label htmlFor="blast-assignee">Lead assignment</Label>
                <Select
                  value={assigneeChoice}
                  onValueChange={(v) => v && setAssigneeChoice(v)}
                >
                  <SelectTrigger id="blast-assignee" className="w-full">
                    <SelectValue>{assigneeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_ASSIGNEE}>Anyone (no filter)</SelectItem>
                    {leadOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        Only builders led by {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-500">
                  When set, only contacts at builders where this person is the lead are included.
                </p>
              </div>

              {/* Recipient preview — each emailable contact has a checkbox
                  (default checked). Contacts without an email show but
                  can't be selected. Builder header has a select-all/none
                  toggle scoped to that builder's emailable contacts. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                  <div className="text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
                    Recipients{" "}
                    {isLoading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                  </div>
                  <div className="text-[12px] tabular-nums text-gray-600">
                    <span className="font-semibold">{checkedWithEmail.length}</span>
                    <span className="text-gray-400"> / {recipientCount} selected</span>
                    {recipientCount > 0 && recipientsWithEmail !== recipientCount && (
                      <span className="ml-2 text-amber-700">
                        ({recipientCount - recipientsWithEmail} without email)
                      </span>
                    )}
                  </div>
                </div>

                <div className="max-h-[260px] overflow-y-auto px-3 py-2">
                  {selectedTiers.size === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-400 italic">
                      Pick at least one tier to see who would receive the blast.
                    </p>
                  ) : recipientCount === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-400 italic">
                      No contacts match these filters.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {grouped.map((g) => {
                        const emailableIds = g.contacts
                          .filter((c) => c.contactEmail)
                          .map((c) => c.contactId);
                        const allUnchecked =
                          emailableIds.length > 0 &&
                          emailableIds.every((id) => excludedContactIds.has(id));
                        const someChecked =
                          emailableIds.length > 0 &&
                          emailableIds.some((id) => !excludedContactIds.has(id));
                        return (
                          <li key={g.builderName}>
                            <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-gray-700 select-none">
                              <input
                                type="checkbox"
                                disabled={emailableIds.length === 0}
                                checked={someChecked}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate =
                                      someChecked && !emailableIds.every((id) => !excludedContactIds.has(id));
                                  }
                                }}
                                onChange={() => toggleBuilder(emailableIds)}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              <Building2 className="h-3 w-3 text-gray-400" />
                              <span className={cn(allUnchecked && "text-gray-400")}>
                                {g.builderName}
                              </span>
                              <span className="text-gray-400">·</span>
                              <span className="text-[10px] tabular-nums text-gray-500">
                                {g.contacts.length}
                              </span>
                            </label>
                            <ul className="ml-6 space-y-0.5">
                              {g.contacts.map((c) => {
                                const hasEmail = Boolean(c.contactEmail);
                                const checked = hasEmail && !excludedContactIds.has(c.contactId);
                                return (
                                  <li key={c.contactId}>
                                    <label
                                      className={cn(
                                        "flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-[12px] transition-colors",
                                        hasEmail
                                          ? checked
                                            ? "hover:bg-white"
                                            : "text-gray-400 hover:bg-white"
                                          : "cursor-not-allowed",
                                      )}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <input
                                          type="checkbox"
                                          disabled={!hasEmail}
                                          checked={checked}
                                          onChange={() => toggleContact(c.contactId)}
                                          className="h-3.5 w-3.5 rounded border-gray-300"
                                        />
                                        <span
                                          className={cn(
                                            "font-medium",
                                            checked ? "text-gray-800" : "text-gray-400",
                                          )}
                                        >
                                          {c.contactName}
                                        </span>
                                      </span>
                                      {c.contactEmail ? (
                                        <span
                                          className={cn(
                                            "inline-flex items-center gap-1",
                                            checked ? "text-gray-500" : "text-gray-300",
                                          )}
                                        >
                                          <Mail className="h-3 w-3" />
                                          {c.contactEmail}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-amber-700 italic">
                                          no email
                                        </span>
                                      )}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <div className="mr-auto text-[10px] text-gray-500">
                Step 1 of 2 — pick recipients, then preview the email.
              </div>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={emailCount === 0 || previewLoading}
                onClick={handleProceedToPreview}
              >
                {previewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Next: review {emailCount || "0"} {emailCount === 1 ? "email" : "emails"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Step 2 — same Dialog, content swapped. Back goes to the
          // filter step (preserving its state). Send closes the dialog.
          <EmailPreviewBody
            title={title}
            recipients={previewRecipients}
            template={template}
            vars={previewVars}
            attachmentChoices={attachmentChoices}
            defaultSelectedAttachmentIds={defaultAttachmentIds}
            senderOptions={senderOptions}
            defaultSenderId={defaultSenderId}
            ccOptions={ccOptions}
            ccInitial={ccInitial}
            onCcChange={async ({ builderId, userIds }) => {
              await setBuilderCcUsers({ dealId, builderId, userIds });
            }}
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
                    description:
                      first && !first.ok ? first.reason : "Check Resend logs.",
                    duration: 8000,
                  },
                );
              } else {
                const failed = result.outcomes.filter((o) => !o.ok);
                toast.warning(
                  `Sent ${result.sent}, failed ${result.failed}`,
                  {
                    description: failed
                      .map((f) => `${f.builderName}: ${"reason" in f ? f.reason : ""}`)
                      .join("; "),
                    duration: 10000,
                  },
                );
              }
            }}
            onBack={() => setStep("filter")}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
