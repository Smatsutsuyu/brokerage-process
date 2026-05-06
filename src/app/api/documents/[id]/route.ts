// Document download endpoint. Authz check, then stream the file from
// Vercel Blob's private store. Private blobs aren't directly fetchable —
// the URL stored in documents.r2_key is just a stable identifier; only
// the SDK with BLOB_READ_WRITE_TOKEN can resolve it to actual bytes.
//
// Trade-off: every download flows through this Next.js function (eats
// some compute + bandwidth) instead of a direct redirect to a CDN URL.
// At Lakebridge volume (small files, low download frequency) the cost
// is negligible and we get full audit-trail control over who reads what.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [doc] = await db
    .select({
      id: documents.id,
      r2Key: documents.r2Key,
      name: documents.name,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, org.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!doc.r2Key) {
    return NextResponse.json({ error: "No file attached" }, { status: 404 });
  }

  // Fetch the private blob via the SDK. Returns a stream we pipe through
  // to the user's response so the file never lands in our function memory.
  const blob = await get(doc.r2Key, { access: "private" });
  if (!blob) {
    return NextResponse.json({ error: "Blob not found in store" }, { status: 404 });
  }

  // get() returns contentDisposition (how to display) but not contentType,
  // so we use what we recorded at upload time (set from head() meta.contentType
  // in recordUploadedDocument). Content-Disposition: inline so PDFs render
  // in the browser tab; users can right-click → save to download.
  const headers = new Headers();
  headers.set("Content-Type", doc.mimeType ?? "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(doc.name)}"`,
  );

  return new Response(blob.stream, { status: 200, headers });
}
