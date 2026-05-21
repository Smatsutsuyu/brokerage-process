"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  Paperclip,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CcPicker } from "@/components/email/cc-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { interpolate, type EmailTemplate } from "@/lib/email-templates";
import { cn } from "@/lib/utils";

// One row per recipient. Caller groups them per-builder by passing the
// builderId/name on each row; the modal does the grouping into emails.
export type EmailRecipient = {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  builderId: string;
  builderName: string;
};

// One pickable "From:" choice. The signature line in the body is
// re-interpolated when the user swaps senders so {{senderName}} stays
// in sync with whoever's "from" field is selected.
export type EmailSenderChoice = {
  id: string;
  name: string;
  email: string;
  // First name token used as the {{senderName}} substitution value.
  firstName: string;
  // Optional grouping — choices with the same group render together,
  // separated from other groups by a divider in the dropdown. Used for
  // the "Chris (canonical sender) — separator — current user" pattern.
  group?: string;
};

// One pickable CC user. Email is included so the modal can render the
// CC chip with both name and address (matches the To: chip style).
export type EmailCcUserOption = {
  id: string;
  name: string;
  email: string;
};

// Initial per-builder CC selection passed in by the caller. The modal
// owns the editable state from there — toggling a name updates the
// modal's internal map AND fires onCcChange so the caller can persist.
export type EmailCcInitialEntry = {
  builderId: string;
  userIds: string[];
};

// One possible attachment the user can pick from. Three kinds:
//
//   "file":      a stored document we fetch from Vercel Blob at send
//                time and attach as bytes. Recipient gets a real
//                attachment in their inbox.
//
//   "link":      an external URL (Dropbox folder, SharePoint, etc.)
//                that we can't attach because it's access-gated by
//                another system. The send handler appends the URL to
//                the body as text. Do NOT use this for our own PDF
//                routes — recipients without a session can't fetch.
//
//   "generated": a PDF we render server-side at send time and attach
//                as bytes. The `generator` string keys into a registry
//                in lib/email/blast.ts (marketing-report, dd-tracking,
//                etc.). Use this for any in-app PDF that needs to ship
//                to recipients without app accounts.
//
// `id` is opaque to the modal; caller derives stable IDs so the checkbox
// state survives across re-renders.
export type EmailAttachment =
  | {
      id: string;
      kind: "file";
      documentId: string;
      filename: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
    }
  | { id: string; kind: "link"; url: string; label: string | null }
  | {
      id: string;
      kind: "generated";
      generator: "marketing-report" | "dd-tracking";
      filename: string;
    };

// Shared props between the standalone modal and the embeddable body.
type EmailPreviewBaseProps = {
  // What we're previewing — surfaces in the modal title.
  // e.g. "OM blast", "Q&A distribution", "Day-of reminder".
  title: string;
  // Optional override for the description text under the title. When
  // omitted, the default "one email per builder" copy renders — fits
  // OM blast / Q&A / Day-of reminder and similar per-builder sends.
  // Override for flows where that copy is wrong (e.g. single-email
  // sends to one team grouping like Send Marketing Report).
  description?: string;
  // Full set of recipients across all builders. The modal groups by
  // builderId so each builder = one outbound email with multiple To:
  // addresses (matches Chris's "one email per builder" rule).
  recipients: EmailRecipient[];
  template: EmailTemplate;
  // Variables for {{placeholder}} substitution in subject and body.
  // Caller controls what's available (deal name, sender name, etc.).
  vars: Record<string, string>;
  // Pool of attachments the user can pick from — every uploaded file +
  // every link on the source checklist row, etc. Empty array (default)
  // hides the attachment section entirely. Same selection applies to
  // every per-builder email (what Chris wants for OM-blast — one OM
  // bundle goes to everyone).
  attachmentChoices?: EmailAttachment[];
  // Pre-checked attachment ids on first open. Caller picks the default
  // (e.g. latest file). User can toggle from there.
  defaultSelectedAttachmentIds?: string[];
  // Available "From:" choices. When omitted or empty, the modal shows
  // no sender picker (back-compat). When provided, the user picks one
  // and {{senderName}} is re-interpolated in body+subject.
  senderOptions?: EmailSenderChoice[];
  defaultSenderId?: string;
  // Pool of CC users the picker can select from. Empty / omitted hides
  // the CC affordance entirely.
  ccOptions?: EmailCcUserOption[];
  // Initial per-builder CC selection. Modal's internal state is seeded
  // from here on open; toggling changes call onCcChange so the caller
  // can persist (e.g. to deal_buyers.cc_user_ids).
  ccInitial?: EmailCcInitialEntry[];
  // Persistence callback. Called with builderId + the new full user-id
  // list after every toggle. Async so the picker can show loading state.
  // Optional: omit to make CC ephemeral (for-this-send-only).
  onCcChange?: (input: { builderId: string; userIds: string[] }) => Promise<void> | void;
  // Called when the user clicks Send. The actual transport (Resend etc.)
  // is the caller's concern — this modal only owns the compose/preview UX.
  // Callers wire to the sendBlastEmails server action which handles
  // Blob-attachment fetch + per-builder Resend calls.
  onSend?: (emails: ResolvedEmail[]) => Promise<void> | void;
};

// The embeddable body component's props. Adds an explicit close callback
// (caller decides what "close" means: dismiss the standalone modal, or
// reset the parent flow) and an optional back callback for the
// step-flow case in BlastModal where step 2 wants a Back button instead
// of Cancel.
type EmailPreviewBodyProps = EmailPreviewBaseProps & {
  // Called when the user clicks Cancel (when no onBack is provided) or
  // when a Send completes successfully. The caller decides what to do
  // with the dialog state.
  onClose: () => void;
  // When provided, the footer shows a "Back" button in place of
  // "Cancel". Used by BlastModal to step back to the filter view.
  onBack?: () => void;
};

// Wrapper modal: same props as the body, plus open/onOpenChange for a
// standalone dialog. Existing callers (DealTeamSendButton) keep working
// unchanged.
type EmailPreviewModalProps = EmailPreviewBaseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Per-builder resolved email — the unit that would actually be sent.
export type ResolvedEmail = {
  builderId: string;
  builderName: string;
  // Selected sender (From: line). Null when no sender options were
  // provided to the modal — caller falls back to a default.
  from: EmailSenderChoice | null;
  to: { contactId: string; name: string; email: string }[];
  // CC list pulled from the builder's per-builder CC config.
  cc: { userId: string; name: string; email: string }[];
  subject: string;
  body: string;
  // Attachments the user picked from `attachmentChoices`. Same selection
  // for every per-builder email — caller's responsibility to actually
  // transmit them at send time.
  attachments: EmailAttachment[];
};

function formatBytes(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Group recipients by builder, drop those without an email since they
// can't be sent to (caller's filter UI should also flag these but we
// double-check here).
function groupByBuilder(recipients: EmailRecipient[]) {
  const map = new Map<
    string,
    { builderId: string; builderName: string; recipients: EmailRecipient[] }
  >();
  for (const r of recipients) {
    if (!r.contactEmail) continue;
    let g = map.get(r.builderId);
    if (!g) {
      g = { builderId: r.builderId, builderName: r.builderName, recipients: [] };
      map.set(r.builderId, g);
    }
    g.recipients.push(r);
  }
  return Array.from(map.values());
}

// Inner content (header + body + footer) without the Dialog wrapper.
// Use this when you want to embed the preview inside another Dialog (see
// BlastModal's step 2). For a standalone preview dialog, use
// `EmailPreviewModal` instead — it wraps this in Dialog/DialogContent.
export function EmailPreviewBody({
  title,
  description,
  recipients,
  template,
  vars,
  attachmentChoices,
  defaultSelectedAttachmentIds,
  senderOptions,
  defaultSenderId,
  ccOptions,
  ccInitial,
  onCcChange,
  onSend,
  onClose,
  onBack,
}: EmailPreviewBodyProps) {
  const groups = useMemo(() => groupByBuilder(recipients), [recipients]);
  const choices = attachmentChoices ?? [];
  const senders = senderOptions ?? [];
  const ccOpts = ccOptions ?? [];

  // Lookup helper for resolving user IDs → {name, email}. Used to render
  // the CC chip line from whatever is currently selected.
  const ccUserById = useMemo(() => {
    const m = new Map<string, EmailCcUserOption>();
    for (const o of ccOpts) m.set(o.id, o);
    return m;
  }, [ccOpts]);

  // Editable per-builder CC selection. Map<builderId, Set<userId>>.
  // Seeded from ccInitial each time the modal opens.
  const [ccByBuilder, setCcByBuilder] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );

  // Subject/body are edited once and apply to every email (per Chris:
  // single template, multiple recipients). The paginator below changes
  // the To: line that's previewed but not the body text.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [sending, setSending] = useState(false);
  // Selected attachment ids — Set so toggling stays O(1). Reset to the
  // caller's defaults each time the modal opens.
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Selected sender id — null when no senderOptions were provided.
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null);
  const selectedSender = useMemo(
    () => senders.find((s) => s.id === selectedSenderId) ?? null,
    [senders, selectedSenderId],
  );

  // Effective vars for {{...}} substitution = caller's vars overlaid with
  // the picked sender's first name. This way swapping senders re-derives
  // the signature line without a second server round-trip.
  const effectiveVars = useMemo(
    () =>
      selectedSender
        ? { ...vars, senderName: selectedSender.firstName }
        : vars,
    [vars, selectedSender],
  );

  // Reset to the resolved template + default attachment selection + default
  // sender + initial CC selection on mount and whenever the relevant
  // inputs change. The body unmounts/remounts each time it's shown
  // (Dialog open transitions for the standalone case; conditional render
  // in BlastModal's step flow) so this naturally resets each session.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveIdx(0);
    setSelectedAttachmentIds(new Set(defaultSelectedAttachmentIds ?? []));
    setSelectedSenderId(defaultSenderId ?? senders[0]?.id ?? null);
    const m = new Map<string, Set<string>>();
    for (const e of ccInitial ?? []) m.set(e.builderId, new Set(e.userIds));
    setCcByBuilder(m);
  }, [defaultSelectedAttachmentIds, defaultSenderId, senders, ccInitial]);

  // Re-interpolate subject/body whenever the user swaps senders (so the
  // signature line stays in sync). Tradeoff: any body edits the user
  // made get overwritten when they switch senders. Acceptable since
  // users typically pick the sender BEFORE editing.
  useEffect(() => {
    setSubject(interpolate(template.subject, effectiveVars));
    setBody(interpolate(template.body, effectiveVars));
  }, [template.subject, template.body, effectiveVars]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleAttachment(id: string) {
    setSelectedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Apply a new CC selection for one builder. Updates local state and
  // hands the new list to the caller so persistence (server write) can
  // happen out-of-band — picker keeps working even if the persistence
  // call is in flight.
  function applyCcChange(builderId: string, userIds: string[]) {
    setCcByBuilder((prev) => {
      const next = new Map(prev);
      next.set(builderId, new Set(userIds));
      return next;
    });
    if (onCcChange) {
      void onCcChange({ builderId, userIds });
    }
  }

  const selectedAttachments = useMemo(
    () => choices.filter((c) => selectedAttachmentIds.has(c.id)),
    [choices, selectedAttachmentIds],
  );

  const total = groups.length;
  const active = total > 0 ? groups[Math.min(activeIdx, total - 1)] : null;

  function prev() {
    setActiveIdx((i) => (i > 0 ? i - 1 : i));
  }
  function next() {
    setActiveIdx((i) => (i < total - 1 ? i + 1 : i));
  }

  async function handleSend() {
    if (total === 0) return;
    const resolved: ResolvedEmail[] = groups.map((g) => {
      const ccIds = ccByBuilder.get(g.builderId) ?? new Set<string>();
      const cc: ResolvedEmail["cc"] = [];
      for (const id of ccIds) {
        const u = ccUserById.get(id);
        if (u) cc.push({ userId: u.id, name: u.name, email: u.email });
      }
      return {
        builderId: g.builderId,
        builderName: g.builderName,
        from: selectedSender,
        to: g.recipients.map((r) => ({
          contactId: r.contactId,
          name: r.contactName,
          email: r.contactEmail!,
        })),
        cc,
        subject,
        body,
        attachments: selectedAttachments,
      };
    });
    setSending(true);
    try {
      if (onSend) {
        await onSend(resolved);
      } else {
        // No onSend wired — shouldn't happen in production, but log loudly
        // so a misconfigured caller surfaces in dev rather than silently
        // dropping a click.
        toast.error("No send handler wired to this modal", {
          description: "Pass an onSend callback to actually send.",
          duration: 5000,
        });
      }
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Preview &amp; send · {title}</DialogTitle>
        <DialogDescription>
          {description ??
            "One email per builder. Edit the subject or body once and the change applies to every email. Use the arrows to step through recipients and verify the To: line."}
        </DialogDescription>
      </DialogHeader>

        {total === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              No recipients with an email address. Go back and adjust the filters
              or add email addresses to the contacts.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Builder paginator */}
            <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <button
                type="button"
                onClick={prev}
                disabled={activeIdx === 0}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Previous email"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 text-[12px] text-gray-700">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-semibold">{active?.builderName}</span>
                <span className="text-gray-400">·</span>
                <span className="tabular-nums text-gray-500">
                  Email {activeIdx + 1} of {total}
                </span>
              </div>
              <button
                type="button"
                onClick={next}
                disabled={activeIdx >= total - 1}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next email"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* From: dropdown — same sender for every per-builder email.
                Sender choices come grouped via the `group` field; we
                interleave a divider when the group changes (Chris's
                landadvisors address sits in its own group above the
                signed-in user). Hidden entirely when no senderOptions
                were passed. */}
            {senders.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                  From
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50",
                    )}
                  >
                    {selectedSender ? (
                      <span className="flex items-center gap-2 truncate">
                        <Mail className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        <span className="font-medium">{selectedSender.name}</span>
                        <span className="truncate text-gray-500">
                          &lt;{selectedSender.email}&gt;
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Pick a sender</span>
                    )}
                    <ChevronRight className="h-3 w-3 rotate-90 text-gray-400" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
                    {senders.map((s, idx) => {
                      const prevGroup = idx > 0 ? senders[idx - 1].group : undefined;
                      const groupChanged = idx > 0 && (s.group ?? "") !== (prevGroup ?? "");
                      return (
                        <Fragment key={s.id}>
                          {groupChanged && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            onClick={() => setSelectedSenderId(s.id)}
                            className="flex flex-col items-start gap-0 text-[13px]"
                          >
                            <span className="font-medium text-gray-800">{s.name}</span>
                            <span className="text-[11px] text-gray-500">{s.email}</span>
                          </DropdownMenuItem>
                        </Fragment>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* To: line for the active email */}
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                To
              </Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5">
                {active?.recipients.map((r) => (
                  <span
                    key={r.contactId}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                    title={r.contactEmail ?? undefined}
                  >
                    <Mail className="h-2.5 w-2.5 text-gray-400" />
                    <span className="font-medium">{r.contactName}</span>
                    <span className="text-gray-500">&lt;{r.contactEmail}&gt;</span>
                  </span>
                ))}
              </div>
            </div>

            {/* CC line — editable per builder. Picker on the right
                shows checkbox list of org members; toggling fires
                onCcChange so caller can persist (writes to
                deal_buyers.cc_user_ids in the OM-blast wiring).
                Selection persists across deals — set Loan + Tim once
                for Lennar and they show up pre-selected on every
                future Lennar email. Hidden entirely when no
                ccOptions are passed. */}
            {active && ccOpts.length > 0 && (
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                    CC
                  </Label>
                  <CcPicker
                    selectedUserIds={Array.from(
                      ccByBuilder.get(active.builderId) ?? new Set<string>(),
                    )}
                    options={ccOpts.map((o) => ({ id: o.id, name: o.name }))}
                    onChange={(ids) => applyCcChange(active.builderId, ids)}
                    emptyLabel="+ Add CC"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 min-h-[34px]">
                  {Array.from(ccByBuilder.get(active.builderId) ?? new Set<string>())
                    .map((id) => ccUserById.get(id))
                    .filter((u): u is EmailCcUserOption => Boolean(u))
                    .map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] text-purple-900"
                        title={c.email}
                      >
                        <Mail className="h-2.5 w-2.5 text-purple-500" />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-purple-700/70">&lt;{c.email}&gt;</span>
                      </span>
                    ))}
                  {(ccByBuilder.get(active.builderId)?.size ?? 0) === 0 && (
                    <span className="text-[11px] text-gray-400 italic">
                      No CC recipients
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Attachments — same selection goes on every per-builder
                email. Checklist of every available file/link on the
                source row; user picks any subset. Defaults pre-checked
                by the caller (latest file, or first link if no files). */}
            {choices.length > 0 && (
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                    Attachments
                  </Label>
                  <span className="text-[10px] tabular-nums text-gray-500">
                    {selectedAttachmentIds.size} of {choices.length} selected
                  </span>
                </div>
                <ul className="space-y-1 rounded-md border border-gray-200 bg-white p-1.5">
                  {choices.map((c) => {
                    const checked = selectedAttachmentIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors",
                            checked ? "bg-blue-50" : "hover:bg-gray-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAttachment(c.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300"
                          />
                          {c.kind === "file" && (
                            <>
                              <Paperclip className="h-3 w-3 text-blue-700" />
                              <span
                                className={cn(
                                  "font-medium",
                                  checked ? "text-blue-900" : "text-gray-700",
                                )}
                              >
                                {c.filename}
                              </span>
                              {formatBytes(c.sizeBytes) && (
                                <span className="text-[10px] tabular-nums text-gray-500">
                                  {formatBytes(c.sizeBytes)}
                                </span>
                              )}
                            </>
                          )}
                          {c.kind === "generated" && (
                            <>
                              <Paperclip className="h-3 w-3 text-emerald-700" />
                              <span
                                className={cn(
                                  "font-medium",
                                  checked ? "text-emerald-900" : "text-gray-700",
                                )}
                              >
                                {c.filename}
                              </span>
                              <span className="ml-auto text-[10px] tracking-wider text-emerald-700/70 uppercase">
                                generated at send
                              </span>
                            </>
                          )}
                          {c.kind === "link" && (
                            <>
                              <Paperclip className="h-3 w-3 text-amber-700" />
                              <span
                                className={cn(
                                  "font-medium",
                                  checked ? "text-amber-900" : "text-gray-700",
                                )}
                              >
                                {c.label ?? c.url}
                              </span>
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-amber-700/70 hover:text-amber-900"
                                title="Open link in new tab"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              <span className="ml-auto text-[10px] tracking-wider text-amber-700/70 uppercase">
                                link · fetched at send
                              </span>
                            </>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Subject — single edit, applies to all */}
            <div className="grid gap-1.5">
              <Label
                htmlFor="email-preview-subject"
                className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase"
              >
                Subject
              </Label>
              <Input
                id="email-preview-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Body — single edit, applies to all */}
            <div className="grid gap-1.5">
              <Label
                htmlFor="email-preview-body"
                className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase"
              >
                Body
              </Label>
              <Textarea
                id="email-preview-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={cn("min-h-[200px] font-mono text-[13px] leading-relaxed")}
              />
            </div>
          </div>
        )}

      <DialogFooter>
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="button" disabled={total === 0 || sending} onClick={handleSend}>
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send {total > 0 && `${total} ${total === 1 ? "email" : "emails"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

// Standalone modal wrapper. Used by DealTeamSendButton — the case where
// the preview is the entire flow (no filter step beforehand).
export function EmailPreviewModal({
  open,
  onOpenChange,
  ...rest
}: EmailPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <EmailPreviewBody {...rest} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
