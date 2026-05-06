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
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { authorizeDealAccess } from "@/lib/documents";

type UploadClientPayload = {
  dealId: string;
  checklistItemId: string | null;
};

function parsePayload(raw: string | null | undefined): UploadClientPayload {
  if (!raw) throw new Error("Missing upload context");
  const parsed = JSON.parse(raw) as Partial<UploadClientPayload>;
  if (!parsed.dealId || typeof parsed.dealId !== "string") {
    throw new Error("Missing dealId in upload payload");
  }
  return {
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
        await authorizeDealAccess({
          orgId: org.id,
          dealId: payload.dealId,
          checklistItemId: payload.checklistItemId,
        });
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
