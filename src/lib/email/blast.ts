import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { documents } from "@/db/schema";
import type { ResolvedEmail } from "@/components/email/email-preview-modal";

import { sendEmail, type SendEmailAttachment } from "./send";

// Per-builder result. Mirrors the ResolvedEmail unit so the UI can render
// success/failure per builder without re-deriving identity.
export type BlastSendOutcome =
  | { builderId: string; builderName: string; ok: true; id: string }
  | { builderId: string; builderName: string; ok: false; reason: string };

export type BlastSendResult = {
  sent: number;
  failed: number;
  outcomes: BlastSendOutcome[];
};

// Resolves file attachments by reading from Vercel Blob. Org-scoped lookup
// prevents a forged documentId from a sibling org pulling a file. Returns
// a map of documentId → resolved attachment so callers can splice them
// into the per-email payload.
async function resolveFileAttachments(
  documentIds: string[],
  orgId: string,
): Promise<Map<string, SendEmailAttachment>> {
  if (documentIds.length === 0) return new Map();

  // One DB round-trip for all attachments — most blasts only have one or
  // two attachments and they're shared across every per-builder email.
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      r2Key: documents.r2Key,
    })
    .from(documents)
    .where(and(inArray(documents.id, documentIds), eq(documents.orgId, orgId)));

  // Bytes fetch can happen in parallel — they're independent network calls
  // to Vercel Blob.
  const entries = await Promise.all(
    rows
      .filter((r) => r.r2Key !== null)
      .map(async (r) => {
        const blob = await get(r.r2Key!, { access: "private" });
        if (!blob) {
          throw new Error(`Blob not found for document ${r.id}`);
        }
        const arrayBuffer = await new Response(blob.stream).arrayBuffer();
        return [
          r.id,
          { filename: r.name, content: Buffer.from(arrayBuffer) } satisfies SendEmailAttachment,
        ] as const;
      }),
  );

  return new Map(entries);
}

// Appends selected link attachments to the body so the recipient can click
// through. The modal labels these "link · fetched at send" but in practice
// most are Dropbox / SharePoint folder URLs that require auth — fetching
// + attaching would fail or 401. Inlining the URLs in the body is the
// reliable path. If/when we add hosts where direct fetch works (e.g. our
// own /api/documents URLs), we can branch here.
function appendLinksToBody(body: string, links: { url: string; label: string | null }[]): string {
  if (links.length === 0) return body;
  const lines = links.map((l) =>
    l.label && l.label !== l.url ? `${l.label}: ${l.url}` : l.url,
  );
  return `${body}\n\nLinks:\n${lines.join("\n")}`;
}

// Send a batch of ResolvedEmails — one outbound message per builder. Each
// call fetches its attachments once and reuses them across per-builder
// sends. Sends are sequential (not parallel) so we respect Resend's free-
// tier rate limit (2/sec) without bursting. Per-email failures are
// recorded but do not abort the batch — partial success is reported back
// so the UI can show "20 sent, 3 failed" with details.
export async function sendResolvedEmails(
  emails: ResolvedEmail[],
  opts: { orgId: string },
): Promise<BlastSendResult> {
  // Collect every distinct file documentId across the batch. Resolve them
  // once — even though attachment selection is the same across all per-
  // builder emails today, we de-dupe here so a future change to per-builder
  // attachments doesn't multiply the Blob fetches.
  const documentIds = Array.from(
    new Set(
      emails.flatMap((e) =>
        e.attachments.filter((a) => a.kind === "file").map((a) => a.documentId),
      ),
    ),
  );
  const fileAttachmentsById = await resolveFileAttachments(documentIds, opts.orgId);

  const outcomes: BlastSendOutcome[] = [];

  for (const email of emails) {
    if (email.to.length === 0) {
      outcomes.push({
        builderId: email.builderId,
        builderName: email.builderName,
        ok: false,
        reason: "No recipients with an email address",
      });
      continue;
    }
    if (!email.from) {
      outcomes.push({
        builderId: email.builderId,
        builderName: email.builderName,
        ok: false,
        reason: "No sender selected",
      });
      continue;
    }

    const fileAtts = email.attachments
      .filter((a): a is Extract<ResolvedEmail["attachments"][number], { kind: "file" }> => a.kind === "file")
      .map((a) => fileAttachmentsById.get(a.documentId))
      .filter((a): a is SendEmailAttachment => Boolean(a));
    const linkAtts = email.attachments
      .filter((a): a is Extract<ResolvedEmail["attachments"][number], { kind: "link" }> => a.kind === "link")
      .map((a) => ({ url: a.url, label: a.label }));

    // BCC the sender on every send so a copy lands in their inbox.
    // Resend sends through its own SMTP, not the sender's mailbox, so
    // without this the sender's Outlook has no record the message went
    // out. Dedupe in case the sender is already in to/cc (their copy
    // would otherwise duplicate). Generalizes to future per-user senders.
    const toEmails = email.to.map((t) => t.email);
    const ccEmails = email.cc.map((c) => c.email);
    const senderAddr = email.from.email.toLowerCase();
    const alreadyAddressed = [...toEmails, ...ccEmails].some(
      (e) => e.toLowerCase() === senderAddr,
    );

    const result = await sendEmail({
      from: email.from.email,
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      bcc: alreadyAddressed ? undefined : email.from.email,
      subject: email.subject,
      text: appendLinksToBody(email.body, linkAtts),
      attachments: fileAtts,
      tags: [
        { name: "blast-type", value: "outbound" },
        { name: "builder-id", value: email.builderId },
      ],
    });

    if (result.ok) {
      outcomes.push({
        builderId: email.builderId,
        builderName: email.builderName,
        ok: true,
        id: result.id,
      });
    } else {
      outcomes.push({
        builderId: email.builderId,
        builderName: email.builderName,
        ok: false,
        reason: result.error ?? result.reason,
      });
    }
  }

  return {
    sent: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
  };
}
