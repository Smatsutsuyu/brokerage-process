import { redirect } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  authUser,
  feedbackAttachments,
  feedbackComments,
  feedbackItems,
  users,
} from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import type { CommentRow } from "@/components/feedback/comment-thread";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { FeedbackList, type AttachmentRow, type FeedbackRow } from "./feedback-list";
import { TestSendButton } from "./test-send-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Feedback — Land Advisors Portal",
};

export default async function FeedbackAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  if (me.role !== "owner") redirect("/");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

  // Two aliased joins to authUser — one for the original submitter, one
  // for whoever last touched the parent row. Drizzle can't reuse a single
  // alias across two FK paths so we explicitly alias both sides.
  const creatorUsers = alias(users, "creator_users");
  const creatorAuth = alias(authUser, "creator_auth");
  const updaterUsers = alias(users, "updater_users");
  const updaterAuth = alias(authUser, "updater_auth");

  const rows = await db
    .select({
      id: feedbackItems.id,
      section: feedbackItems.section,
      pagePath: feedbackItems.pagePath,
      commitSha: feedbackItems.commitSha,
      severity: feedbackItems.severity,
      status: feedbackItems.status,
      comment: feedbackItems.comment,
      userEmail: feedbackItems.userEmail,
      creatorName: creatorAuth.name,
      createdAt: feedbackItems.createdAt,
      updatedAt: feedbackItems.updatedAt,
      reviewedAt: feedbackItems.reviewedAt,
      actionedAt: feedbackItems.actionedAt,
      lastUpdatedById: feedbackItems.lastUpdatedBy,
      lastUpdatedByName: updaterAuth.name,
      lastUpdatedByEmail: updaterAuth.email,
    })
    .from(feedbackItems)
    .leftJoin(creatorUsers, eq(creatorUsers.id, feedbackItems.userId))
    .leftJoin(creatorAuth, eq(creatorAuth.id, creatorUsers.authUserId))
    .leftJoin(updaterUsers, eq(updaterUsers.id, feedbackItems.lastUpdatedBy))
    .leftJoin(updaterAuth, eq(updaterAuth.id, updaterUsers.authUserId))
    .where(eq(feedbackItems.orgId, org.id))
    .orderBy(desc(feedbackItems.createdAt));

  // Fetch all comments for these items in one query, then bucket by id.
  // Volume is small (per-feedback comments measured in single digits) so a
  // single inArray query is fine; no need for a per-row lookup.
  const itemIds = rows.map((r) => r.id);
  const commentRows = itemIds.length
    ? await db
        .select({
          id: feedbackComments.id,
          feedbackId: feedbackComments.feedbackId,
          authorId: feedbackComments.userId,
          authorEmail: feedbackComments.userEmail,
          body: feedbackComments.body,
          createdAt: feedbackComments.createdAt,
          updatedAt: feedbackComments.updatedAt,
        })
        .from(feedbackComments)
        .where(inArray(feedbackComments.feedbackId, itemIds))
        .orderBy(asc(feedbackComments.createdAt))
    : [];

  const commentsByFeedback: Record<string, CommentRow[]> = {};
  for (const c of commentRows) {
    const list = (commentsByFeedback[c.feedbackId] ??= []);
    list.push({
      id: c.id,
      authorId: c.authorId,
      authorEmail: c.authorEmail,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    });
  }

  // Same one-shot inArray pattern for attachments — feedback attachments
  // are sparse (most items have zero), so a join would fan out unnecessarily.
  const attachmentRows = itemIds.length
    ? await db
        .select({
          id: feedbackAttachments.id,
          feedbackId: feedbackAttachments.feedbackId,
          name: feedbackAttachments.name,
          mimeType: feedbackAttachments.mimeType,
          sizeBytes: feedbackAttachments.sizeBytes,
          uploadedAt: feedbackAttachments.uploadedAt,
        })
        .from(feedbackAttachments)
        .where(inArray(feedbackAttachments.feedbackId, itemIds))
        .orderBy(asc(feedbackAttachments.uploadedAt))
    : [];

  const attachmentsByFeedback: Record<string, AttachmentRow[]> = {};
  for (const a of attachmentRows) {
    const list = (attachmentsByFeedback[a.feedbackId] ??= []);
    list.push({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt.toISOString(),
    });
  }

  const items: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    section: r.section,
    pagePath: r.pagePath,
    commitSha: r.commitSha,
    severity: r.severity,
    status: r.status,
    comment: r.comment,
    userEmail: r.userEmail,
    creatorName: r.creatorName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    actionedAt: r.actionedAt?.toISOString() ?? null,
    lastUpdatedByName: r.lastUpdatedByName,
    lastUpdatedByEmail: r.lastUpdatedByEmail,
    // Untouched items have lastUpdatedBy = null even though updatedAt is
    // populated (default now() at insert). Treat as "never updated."
    hasBeenUpdated: r.lastUpdatedById !== null,
    comments: commentsByFeedback[r.id] ?? [],
    attachments: attachmentsByFeedback[r.id] ?? [],
  }));

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] leading-tight font-bold text-gray-900">Feedback</h1>
            <p className="text-[13px] text-gray-400">
              In-app feedback submissions. Update status as you triage; reply via the thread on
              each item. Owner-only.
            </p>
          </div>
          <TestSendButton defaultRecipient={me.email} />
        </header>
        <FeedbackList items={items} currentUserId={me.id} />
      </main>
    </>
  );
}
