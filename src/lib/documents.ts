// Shared document/blob helpers. Used by:
// - /api/upload/blob route (writes a row when a direct browser upload completes)
// - /api/documents/[id] route (authz check + redirect to blob URL)
// - server actions invoked by the checklist UI (delete a doc)
//
// Centralized here so the authz + versioning + revalidation rules live in
// one place and can't drift between callers.

import "server-only";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { del, head } from "@vercel/blob";

import { db } from "@/db";
import { checklistCategories, checklistItems, dealBuyers, deals, documents } from "@/db/schema";

export type AuthorizedUploadContext = {
  orgId: string;
  userId: string;
  dealId: string;
  checklistItemId: string | null;
};

// Verifies the deal belongs to the user's org, and (if supplied) the
// checklist item belongs to the deal. Throws on mismatch — used by the
// upload route's onBeforeGenerateToken AND by deletion paths.
export async function authorizeDealAccess(args: {
  orgId: string;
  dealId: string;
  checklistItemId?: string | null;
}): Promise<void> {
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, args.dealId), eq(deals.orgId, args.orgId)))
    .limit(1);
  if (!deal) throw new Error("Deal not found");

  if (args.checklistItemId) {
    const [row] = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .innerJoin(
        checklistCategories,
        eq(checklistItems.categoryId, checklistCategories.id),
      )
      .where(
        and(
          eq(checklistItems.id, args.checklistItemId),
          eq(checklistCategories.dealId, args.dealId),
        ),
      )
      .limit(1);
    if (!row) throw new Error("Checklist item not on this deal");
  }

  // Touch dealBuyers so it gets imported (suppresses unused warnings if/when
  // we add buyer-scoped uploads later). No-op query intentionally avoided.
  void dealBuyers;
}

// Computes the next version number for a document attached to a given
// (deal, checklist item) pair. New attachments start at 1; replacing an
// existing doc bumps to max+1. Items without a checklist association
// always get version 1 (each is a distinct doc, no implied history).
export async function nextVersionFor(args: {
  dealId: string;
  checklistItemId: string | null;
}): Promise<number> {
  if (!args.checklistItemId) return 1;
  const [latest] = await db
    .select({ version: documents.version })
    .from(documents)
    .where(
      and(
        eq(documents.dealId, args.dealId),
        eq(documents.checklistItemId, args.checklistItemId),
      ),
    )
    .orderBy(desc(documents.version))
    .limit(1);
  return (latest?.version ?? 0) + 1;
}

// Writes the metadata row after a successful direct browser upload to
// Vercel Blob. Verifies the blob exists in our store via head() before
// recording — the client tells us a pathname, but the server independently
// confirms the file is real and ours (head() throws if the pathname doesn't
// resolve in this app's blob store, which prevents a malicious caller from
// injecting an arbitrary URL into the documents table).
//
// Auto-versions per (deal, checklist item) pair. Revalidates the deal page
// so the UI reflects the new doc on next fetch.
export async function recordUploadedDocument(args: {
  orgId: string;
  userId: string | null;
  dealId: string;
  checklistItemId: string | null;
  // Pathname returned by the @vercel/blob client's upload(). Server uses
  // head() to derive the canonical URL + size + content type.
  blobPathname: string;
  name: string;
}): Promise<void> {
  // head() resolves the blob in OUR store using BLOB_READ_WRITE_TOKEN. If
  // the pathname is fake (or in someone else's store), this throws and we
  // never write the row.
  const meta = await head(args.blobPathname);

  const version = await nextVersionFor({
    dealId: args.dealId,
    checklistItemId: args.checklistItemId,
  });
  await db.insert(documents).values({
    orgId: args.orgId,
    dealId: args.dealId,
    checklistItemId: args.checklistItemId,
    name: args.name,
    version,
    status: "final",
    r2Key: meta.url,
    mimeType: meta.contentType ?? null,
    sizeBytes: meta.size,
    uploadedBy: args.userId,
  });

  revalidatePath(`/deals/${args.dealId}`);
}

// Deletes a document (blob + row). Caller must have already verified the
// caller's org matches the document's org.
export async function deleteDocumentBlob(args: {
  documentId: string;
  blobUrl: string | null;
  dealId: string;
}): Promise<void> {
  // Best-effort delete on the blob — if Vercel Blob has already lost the
  // file or the URL is stale, we still remove the row so the UI reflects
  // reality. del() throws on network errors; we swallow + log.
  if (args.blobUrl) {
    try {
      await del(args.blobUrl);
    } catch (err) {
      console.warn("[documents] blob delete failed; removing row anyway", err);
    }
  }
  await db.delete(documents).where(eq(documents.id, args.documentId));
  revalidatePath(`/deals/${args.dealId}`);
}
