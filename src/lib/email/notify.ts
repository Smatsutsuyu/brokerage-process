import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, feedbackComments, feedbackItems, users } from "@/db/schema";

import { sendEmail } from "./send";
import {
  FeedbackCommentEmail,
  type FeedbackCommentProps,
} from "./templates/feedback-comment";
import {
  FeedbackCreatedEmail,
  type FeedbackCreatedProps,
} from "./templates/feedback-created";
import {
  FeedbackStatusChangeEmail,
  type FeedbackStatusChangeProps,
} from "./templates/feedback-status-change";
import { env } from "@/lib/env";

// Per-channel notification dispatch. All four channels are owner-only
// (the /profile toggles only render for owners and these queries also
// filter by role for defense in depth). Errors are swallowed so a failed
// notification never breaks the user-facing action that triggered it.
//
// Channels:
//   notifyOnNewFeedback            — subscribe to the feed (any submission)
//   notifyOnNewComment             — replies on threads I've commented on
//   notifyOnReplyToMine            — replies on feedback I created
//   notifyOnStatusChangeToMine     — status changes on feedback I created

type RecipientFilter = {
  orgId: string;
  // Authenticated-user-id to exclude from the recipient list (so an actor
  // doesn't notify themselves about their own action).
  excludeUserId?: string;
};

// Owners who've subscribed to the firehose feed.
async function recipientsForNewFeedback(filter: RecipientFilter): Promise<string[]> {
  const rows = await db
    .select({ userId: users.id, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(
      and(
        eq(users.orgId, filter.orgId),
        eq(users.role, "owner"),
        eq(users.notifyOnNewFeedback, true),
      ),
    );
  return rows
    .filter((r) => !filter.excludeUserId || r.userId !== filter.excludeUserId)
    .map((r) => r.email);
}

// For comment notifications: union of (creator of this feedback with
// notifyOnReplyToMine = true) and (owners who've commented on this thread
// with notifyOnNewComment = true). Deduped by user id.
async function recipientsForComment(input: {
  orgId: string;
  feedbackId: string;
  excludeUserId?: string;
}): Promise<string[]> {
  // Creator branch: pull the feedback's userId, join through to authUser,
  // include only if creator is an owner with notifyOnReplyToMine = true
  // and not the actor.
  const creatorRows = await db
    .select({ userId: users.id, email: authUser.email })
    .from(feedbackItems)
    .innerJoin(users, eq(users.id, feedbackItems.userId))
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(
      and(
        eq(feedbackItems.id, input.feedbackId),
        eq(feedbackItems.orgId, input.orgId),
        eq(users.role, "owner"),
        eq(users.notifyOnReplyToMine, true),
      ),
    );

  // Participant branch: owners who've previously commented on this thread
  // and have notifyOnNewComment = true.
  const participantRows = await db
    .select({ userId: users.id, email: authUser.email })
    .from(feedbackComments)
    .innerJoin(users, eq(users.id, feedbackComments.userId))
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(
      and(
        eq(feedbackComments.feedbackId, input.feedbackId),
        eq(users.orgId, input.orgId),
        eq(users.role, "owner"),
        eq(users.notifyOnNewComment, true),
      ),
    );

  const byUserId = new Map<string, string>();
  for (const r of [...creatorRows, ...participantRows]) {
    if (input.excludeUserId && r.userId === input.excludeUserId) continue;
    byUserId.set(r.userId, r.email);
  }
  return Array.from(byUserId.values());
}

// Status-change notifications go only to the feedback creator (if owner
// + opted in + not the actor).
async function recipientsForStatusChange(input: {
  orgId: string;
  feedbackId: string;
  excludeUserId?: string;
}): Promise<string[]> {
  const rows = await db
    .select({ userId: users.id, email: authUser.email })
    .from(feedbackItems)
    .innerJoin(users, eq(users.id, feedbackItems.userId))
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(
      and(
        eq(feedbackItems.id, input.feedbackId),
        eq(feedbackItems.orgId, input.orgId),
        eq(users.role, "owner"),
        eq(users.notifyOnStatusChangeToMine, true),
      ),
    );
  return rows
    .filter((r) => !input.excludeUserId || r.userId !== input.excludeUserId)
    .map((r) => r.email);
}

export async function notifyFeedbackCreated(input: {
  orgId: string;
  // Submitter — excluded from the recipient list (no self-notification).
  authorUserId?: string;
  props: Omit<FeedbackCreatedProps, "appUrl">;
}): Promise<void> {
  try {
    const recipients = await recipientsForNewFeedback({
      orgId: input.orgId,
      excludeUserId: input.authorUserId,
    });
    if (recipients.length === 0) return;
    await sendEmail({
      to: recipients,
      subject: `[Lakebridge feedback] ${input.props.severity.toUpperCase()}: ${input.props.section}`,
      react: FeedbackCreatedEmail({ ...input.props, appUrl: env.NEXT_PUBLIC_APP_URL }),
      tags: [{ name: "type", value: "feedback-created" }],
    });
  } catch (err) {
    console.error("[notify:feedback-created] failed to send", err);
  }
}

export async function notifyFeedbackComment(input: {
  orgId: string;
  feedbackId: string;
  // The user who posted the comment, so they don't get notified about
  // their own reply (excluded from both creator and participant branches).
  authorUserId: string;
  props: Omit<FeedbackCommentProps, "appUrl">;
}): Promise<void> {
  try {
    const recipients = await recipientsForComment({
      orgId: input.orgId,
      feedbackId: input.feedbackId,
      excludeUserId: input.authorUserId,
    });
    if (recipients.length === 0) return;
    await sendEmail({
      to: recipients,
      subject: `[Lakebridge feedback] New reply on ${input.props.feedbackSection}`,
      react: FeedbackCommentEmail({ ...input.props, appUrl: env.NEXT_PUBLIC_APP_URL }),
      tags: [{ name: "type", value: "feedback-comment" }],
    });
  } catch (err) {
    console.error("[notify:feedback-comment] failed to send", err);
  }
}

export async function notifyFeedbackStatusChange(input: {
  orgId: string;
  feedbackId: string;
  // The user who changed the status (excluded — no self-notification).
  actorUserId: string;
  props: Omit<FeedbackStatusChangeProps, "appUrl">;
}): Promise<void> {
  try {
    const recipients = await recipientsForStatusChange({
      orgId: input.orgId,
      feedbackId: input.feedbackId,
      excludeUserId: input.actorUserId,
    });
    if (recipients.length === 0) return;
    await sendEmail({
      to: recipients,
      subject: `[Lakebridge feedback] Status changed on ${input.props.feedbackSection}`,
      react: FeedbackStatusChangeEmail({
        ...input.props,
        appUrl: env.NEXT_PUBLIC_APP_URL,
      }),
      tags: [{ name: "type", value: "feedback-status-change" }],
    });
  } catch (err) {
    console.error("[notify:feedback-status-change] failed to send", err);
  }
}
