"use server";

import { db } from "@/db";
import { feedbackItems } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

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
}
