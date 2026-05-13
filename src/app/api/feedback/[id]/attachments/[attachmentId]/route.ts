// Streams a feedback attachment's file from private Vercel Blob storage.
// Same pattern as /api/documents/[id] — owner-only, since the only feedback
// surface that needs to download is /admin/feedback.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { feedbackAttachments } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
): Promise<NextResponse | Response> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (me.role !== "owner") {
    return NextResponse.json({ error: "Owner-only" }, { status: 403 });
  }

  const { id: feedbackId, attachmentId } = await ctx.params;

  const [att] = await db
    .select({
      id: feedbackAttachments.id,
      blobPath: feedbackAttachments.blobPath,
      name: feedbackAttachments.name,
      mimeType: feedbackAttachments.mimeType,
    })
    .from(feedbackAttachments)
    .where(
      and(
        eq(feedbackAttachments.id, attachmentId),
        eq(feedbackAttachments.feedbackId, feedbackId),
        eq(feedbackAttachments.orgId, org.id),
      ),
    )
    .limit(1);

  if (!att) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blob = await get(att.blobPath, { access: "private" });
  if (!blob) {
    return NextResponse.json({ error: "Blob missing" }, { status: 404 });
  }

  // Inline disposition so PDFs/images render in a tab; user can save from
  // there. Filename uses what the uploader picked at upload time.
  const headers = new Headers();
  headers.set("Content-Type", att.mimeType ?? "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(att.name)}"`,
  );

  return new Response(blob.stream, { status: 200, headers });
}
