"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { feedbackItems } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

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
  const { org } = await assertOwner();

  // Set timestamps idempotently. reviewedAt fires on the first transition
  // out of "new"; actionedAt fires on the transition into "actioned" and is
  // preserved through "complete" (since complete implies it was actioned
  // first). Going BACK to "new" clears both — useful if the owner wants to
  // re-open an item.
  const now = new Date();
  const existing = await db.query.feedbackItems.findFirst({
    where: and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)),
    columns: { reviewedAt: true, actionedAt: true },
  });
  const update: {
    status: FeedbackStatus;
    reviewedAt?: Date | null;
    actionedAt?: Date | null;
  } = { status: input.status };

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

  revalidatePath("/admin/feedback");
}

export async function setFeedbackResponse(input: {
  feedbackId: string;
  response: string;
}): Promise<void> {
  const { org } = await assertOwner();

  await db
    .update(feedbackItems)
    .set({ response: input.response.trim() || null })
    .where(and(eq(feedbackItems.id, input.feedbackId), eq(feedbackItems.orgId, org.id)));

  revalidatePath("/admin/feedback");
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  const { org } = await assertOwner();

  await db
    .delete(feedbackItems)
    .where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.orgId, org.id)));

  revalidatePath("/admin/feedback");
}
