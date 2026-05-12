import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";

// Lazy-instantiated Resend client. We don't construct it at module load
// because RESEND_API_KEY is optional — building the client unconditionally
// would force every dev environment to set the key just to import this file.
let resendClient: Resend | null | undefined;
function getResend(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  return resendClient;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  // One of `react` or `html` should be provided. `react` wins if both are.
  react?: React.ReactElement;
  html?: string;
  // Plain-text fallback. Resend will derive one from html if omitted, but
  // explicit text gives better deliverability.
  text?: string;
  replyTo?: string | string[];
  // Optional: tag the send for grouping in Resend's dashboard.
  tags?: { name: string; value: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "disabled" | "config" | "api"; error?: string };

// Single entry point for outbound mail. Behaviors:
// - RESEND_API_KEY unset → "disabled" result, logs the intended send to
//   stdout so dev can verify the trigger fired without actually emailing.
// - EMAIL_FROM unset → "config" result, refuses to send (sender required).
// - Resend API error → "api" result with the error message; never throws.
//   Callers should treat email as fire-and-forget side effects: a failed
//   notification shouldn't break the user-facing action that triggered it.
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    console.log("[email:disabled]", {
      to: input.to,
      subject: input.subject,
      reason: "RESEND_API_KEY not set",
    });
    return { ok: false, reason: "disabled" };
  }
  if (!env.EMAIL_FROM) {
    console.warn("[email:config-error] EMAIL_FROM not set; refusing to send", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, reason: "config", error: "EMAIL_FROM not set" };
  }

  try {
    // Resend's SDK accepts EITHER `react` (renders to HTML server-side) or
    // `html`. We pass through whichever the caller provided.
    const payload = {
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo,
      text: input.text,
      tags: input.tags,
      ...(input.react ? { react: input.react } : { html: input.html ?? "" }),
    };
    const result = await client.emails.send(payload);
    if (result.error) {
      console.error("[email:api-error]", { subject: input.subject, error: result.error });
      return {
        ok: false,
        reason: "api",
        error: result.error.message ?? String(result.error),
      };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email:throw]", { subject: input.subject, error: msg });
    return { ok: false, reason: "api", error: msg };
  }
}
