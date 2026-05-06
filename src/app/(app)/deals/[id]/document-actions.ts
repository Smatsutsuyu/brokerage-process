"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { documents } from "@/db/schema";
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

  await recordUploadedDocument({
    orgId: org.id,
    userId: me.id,
    dealId: input.dealId,
    checklistItemId: input.checklistItemId,
    blobPathname: input.pathname,
    name: input.name,
  });
}

// Client-callable wrapper around the shared deleteDocumentBlob helper.
// Looks up the doc, verifies org ownership, then delegates the blob+row
// delete + revalidation. Returns nothing — the UI revalidates from the
// path invalidation triggered inside the helper.
export async function deleteDocument(documentId: string): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Not signed in");

  const [doc] = await db
    .select({
      id: documents.id,
      r2Key: documents.r2Key,
      dealId: documents.dealId,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, org.id)))
    .limit(1);

  if (!doc) throw new Error("Document not found");

  await deleteDocumentBlob({
    documentId: doc.id,
    blobUrl: doc.r2Key,
    dealId: doc.dealId,
  });
}
