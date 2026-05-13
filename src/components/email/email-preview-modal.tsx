"use client";

import { useEffect, useMemo, useState } from "react";
import {
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

// One possible attachment the user can pick from. "file" = a stored doc
// we'll fetch from blob storage at send time. "link" = an external URL —
// at send time we either link inline or attempt a fetch (host-dependent).
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
  | { id: string; kind: "link"; url: string; label: string | null };

type EmailPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // What we're previewing — surfaces in the modal title.
  // e.g. "OM blast", "Q&A distribution", "Day-of reminder".
  title: string;
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
  // Called when the user clicks Send. The actual transport (Resend etc.)
  // is the caller's concern — this modal only owns the compose/preview UX.
  // For now every caller passes a no-op + toast since email infra isn't
  // wired up; the signature is here so we don't have to refactor when it is.
  onSend?: (emails: ResolvedEmail[]) => Promise<void> | void;
};

// Per-builder resolved email — the unit that would actually be sent.
export type ResolvedEmail = {
  builderId: string;
  builderName: string;
  to: { contactId: string; name: string; email: string }[];
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

export function EmailPreviewModal({
  open,
  onOpenChange,
  title,
  recipients,
  template,
  vars,
  attachmentChoices,
  defaultSelectedAttachmentIds,
  onSend,
}: EmailPreviewModalProps) {
  const groups = useMemo(() => groupByBuilder(recipients), [recipients]);
  const choices = attachmentChoices ?? [];

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

  // Reset to the resolved template + default attachment selection every
  // time the modal opens. Without this, reopening shows stale edits from
  // the previous session, which is confusing.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setSubject(interpolate(template.subject, vars));
    setBody(interpolate(template.body, vars));
    setActiveIdx(0);
    setSelectedAttachmentIds(new Set(defaultSelectedAttachmentIds ?? []));
  }, [open, template.subject, template.body, vars, defaultSelectedAttachmentIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleAttachment(id: string) {
    setSelectedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    const resolved: ResolvedEmail[] = groups.map((g) => ({
      builderId: g.builderId,
      builderName: g.builderName,
      to: g.recipients.map((r) => ({
        contactId: r.contactId,
        name: r.contactName,
        email: r.contactEmail!,
      })),
      subject,
      body,
      attachments: selectedAttachments,
    }));
    setSending(true);
    try {
      if (onSend) {
        await onSend(resolved);
      } else {
        // Default: mocked send. Real Resend wiring lands when the sender
        // domain is verified (landadvisors.com DNS pending).
        toast.success(`Mock-sent ${resolved.length} ${resolved.length === 1 ? "email" : "emails"}`, {
          description: "Email infrastructure isn't wired yet — no real messages were sent.",
          duration: 5000,
        });
      }
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview &amp; send · {title}</DialogTitle>
          <DialogDescription>
            One email per builder. Edit the subject or body once and the change
            applies to every email. Use the arrows to step through recipients
            and verify the To: line.
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
                          {c.kind === "file" ? (
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
                          ) : (
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
          <div className="mr-auto text-[10px] text-gray-500">
            Preview only — sending isn&rsquo;t wired up yet (Resend domain pending).
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={total === 0 || sending} onClick={handleSend}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send {total > 0 && `${total} ${total === 1 ? "email" : "emails"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
