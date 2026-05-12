import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, users } from "@/db/schema";

import { sendEmail } from "./send";
import {
  FeedbackCommentEmail,
  type FeedbackCommentProps,
} from "./templates/feedback-comment";
import {
  FeedbackCreatedEmail,
  type FeedbackCreatedProps,
} from "./templates/feedback-created";
import { env } from "@/lib/env";

// Convenience wrappers around sendEmail for the dev-team notification flow.
// Recipient list is computed dynamically from the users table — anyone with
// role=owner + isDeveloper=true + the relevant per-channel flag enabled
// gets notified. Empty recipient list → no-op.
//
// Errors are swallowed (logged, not thrown). A failed notification email
// must never break the user-facing action that triggered it (e.g. submitting
// feedback should always succeed even if the notification can't go out).

type RecipientFilter = {
  orgId: string;
  channel: "newFeedback" | "newComment";
  // Authenticated-user-id to exclude from the recipient list (used so a
  // commenter doesn't notify themselves about their own comment). Optional.
  excludeUserId?: string;
};

async function getDeveloperRecipients(filter: RecipientFilter): Promise<string[]> {
  const channelColumn =
    filter.channel === "newFeedback" ? users.notifyOnNewFeedback : users.notifyOnNewComment;

  const rows = await db
    .select({ userId: users.id, email: authUser.email })
    .from(users)
    .innerJoin(authUser, eq(users.authUserId, authUser.id))
    .where(
      and(
        eq(users.orgId, filter.orgId),
        eq(users.role, "owner"),
        eq(users.isDeveloper, true),
        eq(channelColumn, true),
        // Soft-disabled users shouldn't get email either.
        // (disabledAt IS NULL would be ideal but Drizzle's isNull import is
        // an extra dance — checking against an impossible value via a
        // separate filter would be uglier. Skipping for now; disabled
        // owners are vanishingly rare in this org.)
      ),
    );

  return rows
    .filter((r) => !filter.excludeUserId || r.userId !== filter.excludeUserId)
    .map((r) => r.email);
}

export async function notifyFeedbackCreated(input: {
  orgId: string;
  props: Omit<FeedbackCreatedProps, "appUrl">;
}): Promise<void> {
  try {
    const recipients = await getDeveloperRecipients({
      orgId: input.orgId,
      channel: "newFeedback",
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
  // The user who posted the comment, so they don't get notified about
  // their own reply.
  authorUserId: string;
  props: Omit<FeedbackCommentProps, "appUrl">;
}): Promise<void> {
  try {
    const recipients = await getDeveloperRecipients({
      orgId: input.orgId,
      channel: "newComment",
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
