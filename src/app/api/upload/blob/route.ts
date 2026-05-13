// Direct browser → Vercel Blob upload — token issuance.
//
// The client calls @vercel/blob/client's `upload()`, which POSTs here to
// get a signed token. The browser then uploads the file directly to Vercel
// Blob using that token.
//
// We DO NOT use handleUpload's onUploadCompleted callback because that
// callback is invoked by Vercel's servers as a webhook back to our app —
// which Vercel can't reach when developing on http://localhost:3000.
// Instead, the client calls a server action (recordUpload, in
// document-actions.ts) after upload() returns. The server action verifies
// the blob exists in our store via head() before writing the metadata
// row, which protects against a malicious caller registering an arbitrary
// URL as a "document."

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { db } from "@/db";
import { feedbackItems } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { authorizeDealAccess } from "@/lib/documents";

// Discriminated union over upload contexts. Each kind has its own
// authorization check + per-blob policy:
//   document             — checklist file attached to a deal item.
//                          No-overwrite (versioned by random suffix on
//                          the client).
//   banner               — per-deal hero image. Stable pathname so
//                          replacing overwrites in place.
//   feedback-attachment  — file attached to a feedback item from the
//                          floating widget. Org-scoped; no overwrite.
type UploadClientPayload =
  | {
      kind: "document";
      dealId: string;
      checklistItemId: string | null;
    }
  | {
      kind: "banner";
      dealId: string;
    }
  | {
      kind: "feedback-attachment";
      feedbackId: string;
    };

function parsePayload(raw: string | null | undefined): UploadClientPayload {
  if (!raw) throw new Error("Missing upload context");
  const parsed = JSON.parse(raw) as Partial<{
    kind: string;
    dealId: string;
    checklistItemId: string | null;
    feedbackId: string;
  }>;

  if (parsed.kind === "feedback-attachment") {
    if (!parsed.feedbackId) {
      throw new Error("Missing feedbackId in feedback-attachment payload");
    }
    return { kind: "feedback-attachment", feedbackId: parsed.feedbackId };
  }
  // Default to "document" for backward compat.
  if (!parsed.dealId) {
    throw new Error("Missing dealId in upload payload");
  }
  if (parsed.kind === "banner") {
    return { kind: "banner", dealId: parsed.dealId };
  }
  return {
    kind: "document",
    dealId: parsed.dealId,
    checklistItemId: parsed.checklistItemId ?? null,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        // Per-kind authorization. Each branch verifies the caller can
        // attach to the named target (deal/item or feedback item) before
        // the token is issued.
        if (payload.kind === "feedback-attachment") {
          const [item] = await db
            .select({ id: feedbackItems.id })
            .from(feedbackItems)
            .where(
              and(
                eq(feedbackItems.id, payload.feedbackId),
                eq(feedbackItems.orgId, org.id),
              ),
            )
            .limit(1);
          if (!item) throw new Error("Feedback item not found");
        } else {
          await authorizeDealAccess({
            orgId: org.id,
            dealId: payload.dealId,
            checklistItemId:
              payload.kind === "document" ? payload.checklistItemId : null,
          });
        }
        return {
          // Allow common doc / image types. Vercel Blob will reject anything
          // outside this list; tightens the surface area vs accepting "*/*".
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/vnd.ms-excel",
            "image/png",
            "image/jpeg",
            "image/webp",
            "text/csv",
            "text/plain",
          ],
          // Banners use a stable path per deal (deals/{id}/banner/...) and
          // are meant to replace in place; documents use the default
          // no-overwrite to protect existing versioned uploads from being
          // accidentally clobbered.
          allowOverwrite: payload.kind === "banner",
          // No tokenPayload needed — completion is handled client-side
          // (see file header), so the server doesn't need to read context
          // from a webhook callback.
        };
      },
      // Intentionally NOT providing onUploadCompleted. handleUpload tries
      // to set up a webhook callback URL when this is present, which fails
      // on localhost (no public URL) and may taint the issued token.
      // Client calls recordUpload directly after upload() returns instead.
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
