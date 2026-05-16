"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { feedbackComments, feedbackItems } from "@/db/schema";
import { env } from "@/lib/env";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { notifyFeedbackStatusChange } from "@/lib/email/notify";
import { sendEmail } from "@/lib/email/send";
import {
  FeedbackSummaryEmail,
  type FeedbackSummaryItem,
} from "@/lib/email/templates/feedback-summary";

export type FeedbackStatus = "new" | "reviewed" | "actioned" | "complete" | "wontfix";

async function assertOwner() {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "owner") throw new Error("Owner-only");
  const org = await getCurrentOrg();
  if (!org) throw new Error("No organization context");
  return { me, org };
}

export async function setFeedbackStatus(input: {
  feedbackId: string;
  status: FeedbackStatus;
}): Promise<void> {
  const { me, org } = await assertOwner();

  // Set timestamps idempotently. reviewedAt fires on the first transition
  // out of "new"; actionedAt fires on the transition into "actioned" and is
  // preserved through "complete" (since complete implies it was actioned
  // first). Going BACK to "new" clears both — useful if the owner wants to
  // re-open an item.
  const now = new Date();
  // Pull the row before updating so we know (a) the previous status (to
  // skip notify when no actual change happens) and (b) the email fields
  // we need to render the status-change notification.
  const existing = await db.query.feedbackItems.findFirst({
    where: and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)),
    columns: {
      status: true,
      reviewedAt: true,
      actionedAt: true,
      section: true,
      pagePath: true,
      comment: true,
    },
  });
  const update: {
    status: FeedbackStatus;
    reviewedAt?: Date | null;
    actionedAt?: Date | null;
    lastUpdatedBy: string;
  } = { status: input.status, lastUpdatedBy: me.id };

  if (input.status === "new") {
    update.reviewedAt = null;
    update.actionedAt = null;
  } else if (input.status === "actioned") {
    update.reviewedAt = existing?.reviewedAt ?? now;
    update.actionedAt = existing?.actionedAt ?? now;
  } else if (input.status === "complete") {
    // Complete implies the work shipped (actioned) AND the reporter signed
    // off. Preserve any existing timestamps; stamp now as a fallback if the
    // owner jumped straight to complete without a prior actioned state.
    update.reviewedAt = existing?.reviewedAt ?? now;
    update.actionedAt = existing?.actionedAt ?? now;
  } else {
    // reviewed | wontfix → reviewed but no work shipped.
    update.reviewedAt = existing?.reviewedAt ?? now;
    update.actionedAt = null;
  }

  await db
    .update(feedbackItems)
    .set(update)
    .where(and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)));

  // Notify the original submitter (if they have notifyOnStatusChangeToMine
  // enabled and aren't the actor) — but only when status actually changed.
  if (existing && existing.status !== input.status) {
    await notifyFeedbackStatusChange({
      orgId: org.id,
      feedbackId: input.feedbackId,
      actorUserId: me.id,
      props: {
        actorEmail: me.email,
        feedbackSection: existing.section,
        feedbackBody: existing.comment,
        feedbackPagePath: existing.pagePath,
        fromStatus: existing.status,
        toStatus: input.status,
      },
    });
  }

  revalidatePath("/admin/feedback");
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  const { org } = await assertOwner();

  await db
    .delete(feedbackItems)
    .where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.orgId, org.id)));

  revalidatePath("/admin/feedback");
}

// Sends an open-items summary email to a chosen recipient. Used as the
// admin "test send" affordance — fires the actual Resend pipeline so we can
// verify the wiring end-to-end without waiting for a real feedback event.
// Recipient defaults to FEEDBACK_NOTIFY_EMAIL on the client side; we don't
// hardcode it server-side so the owner can email anyone for testing.
export type SendSummaryResult =
  | { ok: true; itemCount: number }
  | { ok: false; reason: "disabled" | "config" | "api"; error?: string };

export async function sendFeedbackSummary(input: {
  recipient: string;
}): Promise<SendSummaryResult> {
  const { org } = await assertOwner();
  const recipient = input.recipient.trim();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, reason: "config", error: "Recipient email is required" };
  }

  // Pull every non-terminal item (the same "open" definition used in the
  // admin filter): new + reviewed + actioned. Complete + wontfix are
  // omitted — terminal states aren't action-needing.
  const rows = await db
    .select({
      id: feedbackItems.id,
      severity: feedbackItems.severity,
      status: feedbackItems.status,
      section: feedbackItems.section,
      pagePath: feedbackItems.pagePath,
      body: feedbackItems.comment,
      submitterEmail: feedbackItems.userEmail,
      createdAt: feedbackItems.createdAt,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.orgId, org.id),
        inArray(feedbackItems.status, ["new", "reviewed", "actioned"]),
      ),
    )
    .orderBy(desc(feedbackItems.createdAt));

  // Per-item comment counts via a single grouped query (avoid N+1).
  const itemIds = rows.map((r) => r.id);
  const counts = itemIds.length
    ? await db
        .select({
          feedbackId: feedbackComments.feedbackId,
          count: sql<number>`count(*)::int`,
        })
        .from(feedbackComments)
        .where(inArray(feedbackComments.feedbackId, itemIds))
        .groupBy(feedbackComments.feedbackId)
        .orderBy(asc(feedbackComments.feedbackId))
    : [];
  const countByItem = new Map(counts.map((c) => [c.feedbackId, c.count]));

  const items: FeedbackSummaryItem[] = rows.map((r) => ({
    id: r.id,
    severity: r.severity,
    status: r.status,
    section: r.section,
    pagePath: r.pagePath,
    body: r.body,
    submitterEmail: r.submitterEmail,
    createdAt: r.createdAt.toISOString(),
    commentCount: countByItem.get(r.id) ?? 0,
  }));

  const subject =
    items.length === 0
      ? "Lakebridge feedback summary — no open items"
      : `Lakebridge feedback summary — ${items.length} open item${items.length === 1 ? "" : "s"}`;

  const result = await sendEmail({
    to: recipient,
    subject,
    react: FeedbackSummaryEmail({ appUrl: env.NEXT_PUBLIC_APP_URL, items }),
    tags: [{ name: "type", value: "feedback-summary" }],
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason, error: result.error };
  }
  return { ok: true, itemCount: items.length };
}
