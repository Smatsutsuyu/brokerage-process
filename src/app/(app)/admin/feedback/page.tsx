import { redirect } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { feedbackComments, feedbackItems } from "@/db/schema";
import { Sidebar } from "@/components/layout/sidebar";
import type { CommentRow } from "@/components/feedback/comment-thread";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { FeedbackList, type FeedbackRow } from "./feedback-list";
import { TestSendButton } from "./test-send-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Feedback — Lakebridge Capital",
};

export default async function FeedbackAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  if (me.role !== "owner") redirect("/");

  const org = await getCurrentOrg();
  if (!org) redirect("/sign-in");

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
      createdAt: feedbackItems.createdAt,
      reviewedAt: feedbackItems.reviewedAt,
      actionedAt: feedbackItems.actionedAt,
    })
    .from(feedbackItems)
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

  const items: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    section: r.section,
    pagePath: r.pagePath,
    commitSha: r.commitSha,
    severity: r.severity,
    status: r.status,
    comment: r.comment,
    userEmail: r.userEmail,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    actionedAt: r.actionedAt?.toISOString() ?? null,
    comments: commentsByFeedback[r.id] ?? [],
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
