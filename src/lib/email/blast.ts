import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { documents } from "@/db/schema";
import type { ResolvedEmail } from "@/components/email/email-preview-modal";
import { renderGeneratedAttachment } from "@/lib/email/generators";
import { env } from "@/lib/env";

import { sendEmail, type SendEmailAttachment, type SendEmailInput } from "./send";

// Throttle: minimum gap between send STARTS. Resend caps requests per
// second per account (observed ~5/sec); a sequential await loop only
// paces itself by Resend's response latency, so fast responses can burst
// past the cap on a large blast. 250ms ≈ 4 sends/sec keeps us under it
// with margin. A 30-builder blast then takes ~7.5s — fine for a
// deliberate bulk action.
//
// Shipped as a constant default; the SEND_INTERVAL_MS env var overrides
// it when present (tune the rate without a deploy). 0 disables throttling.
const DEFAULT_SEND_INTERVAL_MS = 250;
const SEND_INTERVAL_MS = env.SEND_INTERVAL_MS ?? DEFAULT_SEND_INTERVAL_MS;
// 429 safety net: if a send is still rate-limited (concurrent sends on
// the same key, a lower cap on some accounts), back off and retry rather
// than failing the builder outright.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wrap sendEmail with a retry that only fires on Resend rate-limit
// rejections (sendEmail prefixes those errors with "[rate-limited]").
// Other failures (bad address, etc.) return immediately — retrying them
// would just waste time. Backoff grows linearly with the attempt number.
async function sendWithRateLimitRetry(input: SendEmailInput) {
  let attempt = 0;
  // First try + up to MAX_RATE_LIMIT_RETRIES additional attempts.
  for (;;) {
    const result = await sendEmail(input);
    const rateLimited =
      !result.ok && result.reason === "api" && result.error?.startsWith("[rate-limited]");
    if (!rateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) return result;
    attempt++;
    const backoff = RATE_LIMIT_BACKOFF_MS * attempt;
    console.warn("[blast:rate-limit-retry]", { attempt, backoffMs: backoff });
    await sleep(backoff);
  }
}

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
// sends. Sends are sequential AND throttled (min SEND_INTERVAL_MS between
// starts) so we stay under Resend's per-second rate limit on large
// blasts; rate-limited sends are retried with backoff. Per-email failures
// are recorded but do not abort the batch — partial success is reported
// back so the UI can show "20 sent, 3 failed" with details.
export async function sendResolvedEmails(
  emails: ResolvedEmail[],
  opts: { orgId: string; dealId?: string },
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

  // Render every distinct generated-attachment key once and reuse the
  // bytes across per-builder sends. Generators need the dealId to know
  // what to render; callers attaching kind: "generated" must pass it
  // via opts. Missing dealId on a generated batch is a programming
  // error — fail loud here rather than silently dropping the attachment.
  const generatorKeys = Array.from(
    new Set(
      emails.flatMap((e) =>
        e.attachments.filter((a) => a.kind === "generated").map((a) => a.generator),
      ),
    ),
  );
  const generatedAttachmentsByKey = new Map<string, SendEmailAttachment>();
  if (generatorKeys.length > 0) {
    if (!opts.dealId) {
      throw new Error(
        "sendResolvedEmails: opts.dealId is required when any attachment is kind: 'generated'",
      );
    }
    const dealId = opts.dealId;
    await Promise.all(
      generatorKeys.map(async (generator) => {
        const att = await renderGeneratedAttachment({
          generator,
          dealId,
          orgId: opts.orgId,
        });
        if (att) generatedAttachmentsByKey.set(generator, att);
      }),
    );
  }

  const outcomes: BlastSendOutcome[] = [];

  // Diagnostic timing: log the elapsed-from-start of each send + the gap
  // since the previous one so the effective requests/sec is visible in
  // the dev console. This is what surfaces the Resend rate-limit issue —
  // when sends fire faster than the account's per-second cap, the failing
  // ones come back as `rate_limit_exceeded` (logged by sendEmail). Cheap
  // enough to keep in prod; correlates with the Resend dashboard.
  const batchStart = Date.now();
  let lastSendAt = batchStart;
  let sendIndex = 0;

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
    const generatedAtts = email.attachments
      .filter((a): a is Extract<ResolvedEmail["attachments"][number], { kind: "generated" }> => a.kind === "generated")
      .map((a) => generatedAttachmentsByKey.get(a.generator))
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

    // Throttle: hold each send start at least SEND_INTERVAL_MS after the
    // previous one. The natural send latency usually covers most of this,
    // so we only sleep the remainder (often 0). Keeps the batch under the
    // per-second cap without an explicit per-request token bucket.
    const sinceLast = Date.now() - lastSendAt;
    if (sendIndex > 0 && sinceLast < SEND_INTERVAL_MS) {
      await sleep(SEND_INTERVAL_MS - sinceLast);
    }

    const now = Date.now();
    sendIndex++;
    console.log("[blast:send]", {
      index: sendIndex,
      total: emails.length,
      builder: email.builderName,
      elapsedMs: now - batchStart,
      sincePrevMs: now - lastSendAt,
    });
    lastSendAt = now;

    const result = await sendWithRateLimitRetry({
      from: email.from.email,
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      bcc: alreadyAddressed ? undefined : email.from.email,
      subject: email.subject,
      text: appendLinksToBody(email.body, linkAtts),
      attachments: [...fileAtts, ...generatedAtts],
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
