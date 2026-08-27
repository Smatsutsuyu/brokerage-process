"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { checklistItems, deals, documents } from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  authorizeDealAccess,
  deleteDocumentBlob,
  recordUploadedDocument,
} from "@/lib/documents";

// Called by the client immediately after @vercel/blob/client's upload()
// returns. Verifies the blob belongs in our store + writes the document
// metadata row. Replaces the webhook-style onUploadCompleted callback,
// which doesn't work in local dev (Vercel can't reach localhost).
export async function recordUpload(input: {
  dealId: string;
  checklistItemId: string | null;
  pathname: string;
  name: string;
}): Promise<void> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) throw new Error("Not signed in");

  await authorizeDealAccess({
    orgId: org.id,
    dealId: input.dealId,
    checklistItemId: input.checklistItemId,
  });

  // The deal and checklist item names are only ever wanted for the audit
  // entry, so they are read BEFORE anything is written. A lookup placed after
  // the insert would throw on a connection blip once the row and the blob
  // already exist, and the client reports any throw here as "Upload failed"
  // without refreshing. Read first and the action stays all-or-nothing.
  const [dealRow] = await db
    .select({ name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)))
    .limit(1);

  const [itemRow] = input.checklistItemId
    ? await db
        .select({ name: checklistItems.name })
        .from(checklistItems)
        .where(eq(checklistItems.id, input.checklistItemId))
        .limit(1)
    : [];

  const uploaded = await recordUploadedDocument({
    orgId: org.id,
    userId: me.id,
    dealId: input.dealId,
    checklistItemId: input.checklistItemId,
    blobPathname: input.pathname,
    name: input.name,
  });

  await writeAudit({
    orgId: org.id,
    userId: me.id,
    action: "document.uploaded",
    entityType: "document",
    entityId: uploaded.id,
    // Replacing a file reuses the same name on the same checklist item, so
    // the id and version have to come from the insert itself. Matching on
    // (deal, item, name) picks a sibling version under concurrent replaces.
    //
    // The name is the client-supplied filename with no cap on it, so both
    // copies of it go through the truncator before reaching jsonb. `type`
    // is carried so this entry describes the same field set document.deleted
    // does.
    after: {
      name: truncateForAudit(uploaded.name),
      type: uploaded.type,
      version: uploaded.version,
      status: uploaded.status,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
    },
    metadata: {
      dealId: uploaded.dealId,
      dealName: truncateForAudit(dealRow?.name),
      label: truncateForAudit(uploaded.name),
      checklistItem: itemRow?.name ?? null,
    },
  });
}

// Client-callable wrapper around the shared deleteDocumentBlob helper.
// Looks up the doc, verifies org ownership, then delegates the blob+row
// delete + revalidation. Returns nothing — the UI revalidates from the
// path invalidation triggered inside the helper.
export async function deleteDocument(documentId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Not signed in");
  const me = await getCurrentUser();

  // Both the blob and the row are about to go, so this lookup is the last
  // chance to record what the file was: it carries the business fields and
  // joins through to the deal and the checklist item it satisfied.
  const [doc] = await db
    .select({
      id: documents.id,
      r2Key: documents.r2Key,
      dealId: documents.dealId,
      name: documents.name,
      type: documents.type,
      version: documents.version,
      status: documents.status,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      dealName: deals.name,
      checklistItem: checklistItems.name,
    })
    .from(documents)
    .innerJoin(deals, eq(deals.id, documents.dealId))
    .leftJoin(checklistItems, eq(checklistItems.id, documents.checklistItemId))
    .where(and(eq(documents.id, documentId), eq(documents.orgId, org.id)))
    .limit(1);

  if (!doc) throw new Error("Document not found");

  await deleteDocumentBlob({
    documentId: doc.id,
    blobUrl: doc.r2Key,
    dealId: doc.dealId,
  });

  await writeAudit({
    orgId: org.id,
    userId: me?.id ?? null,
    action: "document.deleted",
    entityType: "document",
    entityId: doc.id,
    before: {
      name: truncateForAudit(doc.name),
      type: doc.type,
      version: doc.version,
      status: doc.status,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    },
    metadata: {
      dealId: doc.dealId,
      dealName: truncateForAudit(doc.dealName),
      label: truncateForAudit(doc.name),
      checklistItem: doc.checklistItem,
    },
  });
}
