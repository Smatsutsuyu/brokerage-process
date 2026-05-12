"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { feedbackComments, feedbackItems } from "@/db/schema";
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

export async function submitFeedback(input: SubmitFeedbackInput) {
  const trimmed = input.comment.trim();
  if (!trimmed) throw new Error("Comment is required");
  if (trimmed.length > 5000) throw new Error("Comment too long (5000 char max)");

  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  const user = await getCurrentUser();

  await db.insert(feedbackItems).values({
    orgId: org.id,
    userId: user?.id,
    userEmail: user?.email,
    section: input.section.slice(0, 200),
    pagePath: input.pagePath.slice(0, 500),
    commitSha: input.commitSha?.slice(0, 64),
    severity: input.severity,
    comment: trimmed,
  });

  // Fire-and-forget notification. Awaited so the Resend call completes
  // before the serverless function exits, but errors are swallowed inside
  // notifyFeedbackCreated so a notification failure can't break submission.
  await notifyFeedbackCreated({
    orgId: org.id,
    props: {
      submitterEmail: user?.email ?? null,
      section: input.section.slice(0, 200),
      pagePath: input.pagePath.slice(0, 500),
      severity: input.severity,
      body: trimmed,
      commitSha: input.commitSha?.slice(0, 64) ?? null,
    },
  });
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

  // Notify all developer-mode owners with the new-comment channel enabled.
  // Excludes the comment's own author (so a developer commenting on
  // something doesn't email themselves). The notify helper handles the
  // recipient query + the channel/preference filtering.
  await notifyFeedbackComment({
    orgId: org.id,
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
  const row = await db
    .select({
      commentId: feedbackComments.id,
      authorId: feedbackComments.userId,
      itemOrgId: feedbackItems.orgId,
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

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
}

export async function deleteFeedbackComment(commentId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");

  const row = await db
    .select({
      commentId: feedbackComments.id,
      authorId: feedbackComments.userId,
      itemOrgId: feedbackItems.orgId,
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

  revalidatePath("/admin/feedback");
  revalidatePath("/feedback");
}
