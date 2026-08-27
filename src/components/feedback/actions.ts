"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { del, head } from "@vercel/blob";

import { db } from "@/db";
import {
  feedbackAttachments,
  feedbackComments,
  feedbackItems,
} from "@/db/schema";
import { truncateForAudit, writeAudit } from "@/lib/audit";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { notifyFeedbackComment, notifyFeedbackCreated } from "@/lib/email/notify";

export type SubmitFeedbackInput = {
  section: string;
  pagePath: string;
  commitSha?: string;
  severity: "nit" | "suggestion" | "bug" | "blocker";
  comment: string;
};

export async function submitFeedback(input: SubmitFeedbackInput): Promise<{
  feedbackId: string;
}> {
  const trimmed = input.comment.trim();
  if (!trimmed) throw new Error("Comment is required");
  if (trimmed.length > 5000) throw new Error("Comment too long (5000 char max)");

  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();

  // Returns the new id so the widget can attach files in a follow-up
  // round-trip (each file streams browser → Vercel Blob direct, then
  // calls recordFeedbackAttachment with the resulting pathname).
  const [created] = await db
    .insert(feedbackItems)
    .values({
      orgId: org.id,
      userId: user?.id,
      userEmail: user?.email,
      section: input.section.slice(0, 200),
      pagePath: input.pagePath.slice(0, 500),
      commitSha: input.commitSha?.slice(0, 64),
      severity: input.severity,
      comment: trimmed,
    })
    .returning();

  // Fire-and-forget notification. Awaited so the Resend call completes
  // before the serverless function exits, but errors are swallowed inside
  // notifyFeedbackCreated so a notification failure can't break submission.
  await notifyFeedbackCreated({
    orgId: org.id,
    authorUserId: user?.id,
    props: {
      submitterEmail: user?.email ?? null,
      section: input.section.slice(0, 200),
      pagePath: input.pagePath.slice(0, 500),
      severity: input.severity,
      body: trimmed,
      commitSha: input.commitSha?.slice(0, 64) ?? null,
    },
  });

  return { feedbackId: created.id };
}

// Records a freshly-uploaded file as an attachment on a feedback item.
// Called by the widget after @vercel/blob/client's upload() completes.
// Verifies the blob exists in OUR store via head() before writing the
// metadata row — protects against a malicious caller registering an
// arbitrary URL as a feedback attachment.
export async function recordFeedbackAttachment(input: {
  feedbackId: string;
  pathname: string;
  name: string;
}): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();

  // Confirm the feedback item belongs to caller's org.
  const [item] = await db
    .select({ id: feedbackItems.id })
    .from(feedbackItems)
    .where(
      and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)),
    )
    .limit(1);
  if (!item) throw new Error("Feedback item not found");

  // head() resolves the blob in our store using BLOB_READ_WRITE_TOKEN.
  // Throws if the pathname doesn't exist — guards against a forged
  // pathname from the client.
  const meta = await head(input.pathname);

  await db.insert(feedbackAttachments).values({
    feedbackId: input.feedbackId,
    orgId: org.id,
    name: input.name.slice(0, 200),
    mimeType: meta.contentType ?? null,
    sizeBytes: meta.size ?? null,
    blobPath: input.pathname,
    uploadedBy: user?.id,
  });

  revalidatePath("/admin/feedback");
}

// Owner-only delete. Drops the row + best-effort deletes the blob so we
// don't accumulate orphans.
export async function deleteFeedbackAttachment(attachmentId: string): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "owner") throw new Error("Owner-only");

  const [att] = await db
    .select({
      id: feedbackAttachments.id,
      feedbackId: feedbackAttachments.feedbackId,
      name: feedbackAttachments.name,
      mimeType: feedbackAttachments.mimeType,
      sizeBytes: feedbackAttachments.sizeBytes,
      blobPath: feedbackAttachments.blobPath,
      uploadedBy: feedbackAttachments.uploadedBy,
      uploadedAt: feedbackAttachments.uploadedAt,
      orgId: feedbackAttachments.orgId,
    })
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.id, attachmentId))
    .limit(1);
  if (!att || att.orgId !== me.orgId) throw new Error("Attachment not found");

  await db.delete(feedbackAttachments).where(eq(feedbackAttachments.id, attachmentId));

  try {
    await del(att.blobPath);
  } catch (err) {
    console.warn("[feedback-attachment] failed to delete blob", err);
  }

  // The row was the only record of who uploaded this file and what it was.
  // Keep the blob pathname too: the del() above is best-effort, so a failed
  // cleanup leaves an orphan that nothing but this entry points at.
  await writeAudit({
    orgId: att.orgId,
    userId: me.id,
    action: "feedback_attachment.deleted",
    entityType: "feedback_attachment",
    entityId: attachmentId,
    before: {
      name: att.name,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      blobPath: att.blobPath,
      uploadedBy: att.uploadedBy,
      uploadedAt: att.uploadedAt,
    },
    metadata: { label: att.name, feedbackId: att.feedbackId },
  });

  revalidatePath("/admin/feedback");
}

const COMMENT_MAX = 5000;

// Comment-thread actions on feedback items. Any signed-in user in the same
// org as the item can post; comment authors can edit/delete their own; org
// owners can edit/delete any. Org-membership is the access boundary.
export async function addFeedbackComment(input: { feedbackId: string; body: string }) {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Comment is required");
  if (trimmed.length > COMMENT_MAX) throw new Error(`Comment too long (${COMMENT_MAX} char max)`);

  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Must belong to the same org as the feedback item. Pull a few item
  // fields up front for the notification payload (saves a second query).
  const item = await db.query.feedbackItems.findFirst({
    where: and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)),
    columns: { id: true, section: true, comment: true, pagePath: true },
  });
  if (!item) throw new Error("Feedback item not found");

  await db.insert(feedbackComments).values({
    feedbackId: input.feedbackId,
    userId: me.id,
    userEmail: me.email,
    body: trimmed,
  });

  // Notify two groups (deduped, excluding the commenter themselves):
  //   1. The feedback creator (if they have notifyOnReplyToMine on)
  //   2. Owners who've previously commented on this thread (if they have
  //      notifyOnNewComment on)
  // The notify helper handles the recipient query + preference filtering.
  await notifyFeedbackComment({
    orgId: org.id,
    feedbackId: input.feedbackId,
    authorUserId: me.id,
    props: {
      authorEmail: me.email,
      feedbackSection: item.section,
      feedbackBody: item.comment,
      feedbackPagePath: item.pagePath,
      commentBody: trimmed,
    },
  });

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
}

export async function editFeedbackComment(input: { commentId: string; body: string }) {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Comment is required");
  if (trimmed.length > COMMENT_MAX) throw new Error(`Comment too long (${COMMENT_MAX} char max)`);

  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // Author OR org owner can edit. Joined to feedback_items to enforce the
  // org boundary even when the comment author's userId is null (deleted user).
  // The body + author columns are the audit snapshot: the update below
  // overwrites body in place and feedback_comments keeps no revision history,
  // so the previous text exists nowhere else once this returns.
  const row = await db
    .select({
      commentId: feedbackComments.id,
      authorId: feedbackComments.userId,
      authorEmail: feedbackComments.userEmail,
      body: feedbackComments.body,
      feedbackId: feedbackComments.feedbackId,
      itemOrgId: feedbackItems.orgId,
      itemSection: feedbackItems.section,
    })
    .from(feedbackComments)
    .innerJoin(feedbackItems, eq(feedbackItems.id, feedbackComments.feedbackId))
    .where(eq(feedbackComments.id, input.commentId))
    .limit(1);
  const found = row[0];
  if (!found || found.itemOrgId !== org.id) throw new Error("Comment not found");

  const isAuthor = found.authorId === me.id;
  const isOwner = me.role === "owner";
  if (!isAuthor && !isOwner) throw new Error("Not authorized");

  await db
    .update(feedbackComments)
    .set({ body: trimmed })
    .where(eq(feedbackComments.id, input.commentId));

  // Treated as destructive, same as deleteFeedbackComment: an owner can
  // rewrite anyone's comment, and the row's userId / userEmail name the
  // AUTHOR, not the editor. Without this nothing records who changed the
  // text or what it said. Skipped on a no-op save so re-submitting an
  // unchanged comment doesn't log a phantom edit.
  if (found.body !== trimmed) {
    await writeAudit({
      orgId: found.itemOrgId,
      userId: me.id,
      action: "feedback_comment.edited",
      entityType: "feedback_comment",
      entityId: input.commentId,
      before: {
        body: truncateForAudit(found.body),
        authorId: found.authorId,
        authorEmail: found.authorEmail,
      },
      after: { body: truncateForAudit(trimmed) },
      // A comment has no name of its own, so the label names the feedback item
      // whose thread it hung off.
      metadata: { label: found.itemSection, feedbackId: found.feedbackId },
    });
  }

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
}

export async function deleteFeedbackComment(commentId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  // The extra columns are the audit snapshot: once the row is gone, its
  // captured author and body are gone with it.
  const row = await db
    .select({
      commentId: feedbackComments.id,
      authorId: feedbackComments.userId,
      authorEmail: feedbackComments.userEmail,
      body: feedbackComments.body,
      createdAt: feedbackComments.createdAt,
      feedbackId: feedbackComments.feedbackId,
      itemOrgId: feedbackItems.orgId,
      itemSection: feedbackItems.section,
    })
    .from(feedbackComments)
    .innerJoin(feedbackItems, eq(feedbackItems.id, feedbackComments.feedbackId))
    .where(eq(feedbackComments.id, commentId))
    .limit(1);
  const found = row[0];
  if (!found || found.itemOrgId !== org.id) throw new Error("Comment not found");

  const isAuthor = found.authorId === me.id;
  const isOwner = me.role === "owner";
  if (!isAuthor && !isOwner) throw new Error("Not authorized");

  await db.delete(feedbackComments).where(eq(feedbackComments.id, commentId));

  // An owner can delete anyone's comment, so the actor and the destroyed
  // author are not the same question. Both belong on the entry.
  await writeAudit({
    orgId: found.itemOrgId,
    userId: me.id,
    action: "feedback_comment.deleted",
    entityType: "feedback_comment",
    entityId: commentId,
    before: {
      body: truncateForAudit(found.body),
      authorId: found.authorId,
      authorEmail: found.authorEmail,
      createdAt: found.createdAt,
    },
    // A comment has no name of its own, so the label names the feedback item
    // whose thread it hung off.
    metadata: { label: found.itemSection, feedbackId: found.feedbackId },
  });

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
}
