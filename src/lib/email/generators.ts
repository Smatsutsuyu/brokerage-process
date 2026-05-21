import "server-only";

import { generateMarketingReportPdf } from "@/lib/pdf/generate-marketing-report";

import type { SendEmailAttachment } from "./send";

// Registry of in-app PDFs that the email blast handler can render server-
// side at send time. Keep this list narrow on purpose: each entry has a
// stable string key used in EmailAttachment ({ kind: "generated",
// generator: "<key>", ... }) so callers can request a freshly-rendered
// PDF as an actual attachment (bytes), not just a URL in the body.
//
// To add a new generator:
//   1. Add the new key to the GeneratorKey union below.
//   2. Add the matching key + the kind: "generated" type in
//      src/components/email/email-preview-modal.tsx -> EmailAttachment.
//   3. Implement a render function returning { filename, content }.
//      (Mirror src/lib/pdf/generate-marketing-report.ts.)
//   4. Wire the new key in renderGeneratedAttachment below.
//
// All renderers are org-scoped: they take an orgId so a forged dealId
// from a sibling org returns null rather than rendering data the caller
// shouldn't see.

export type GeneratorKey = "marketing-report" | "dd-tracking";

// Render a generator key's PDF to bytes ready to attach. Returns null
// if the underlying data lookup fails (deal not in org, deleted, etc.).
// The blast handler treats null as "skip this attachment" and continues
// the send rather than failing the whole batch.
export async function renderGeneratedAttachment(input: {
  generator: GeneratorKey;
  dealId: string;
  orgId: string;
}): Promise<SendEmailAttachment | null> {
  switch (input.generator) {
    case "marketing-report": {
      const pdf = await generateMarketingReportPdf({
        dealId: input.dealId,
        orgId: input.orgId,
      });
      if (!pdf) return null;
      return { filename: pdf.filename, content: pdf.content };
    }
    case "dd-tracking": {
      // Not wired yet — DD Tracking still ships as kind: "link". Once
      // the same data-loader-and-render extraction happens for
      // dd-tracking.pdf, plug it in here the same way as marketing-
      // report. See docs/backlog.md.
      throw new Error("dd-tracking generator not yet implemented");
    }
  }
}

export type { SendEmailAttachment };
