"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { feedbackItems } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type FeedbackStatus = "new" | "reviewed" | "actioned" | "wontfix";

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
  // out of "new"; actionedAt on transition into "actioned". Going BACK to
  // "new" clears both — useful if the owner wants to re-open an item.
  const now = new Date();
  const update: {
    status: FeedbackStatus;
    reviewedAt?: Date | null;
    actionedAt?: Date | null;
  } = { status: input.status };

  if (input.status === "new") {
    update.reviewedAt = null;
    update.actionedAt = null;
  } else {
    // Any other status implies it's been reviewed.
    update.reviewedAt = now;
    update.actionedAt = input.status === "actioned" ? now : null;
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
