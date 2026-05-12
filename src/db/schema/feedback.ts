import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { feedbackSeverityEnum, feedbackStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// In-app feedback submitted from the platform UI. Gated by
// NEXT_PUBLIC_FEEDBACK_ENABLED — when off, the table receives no writes.
// Designed to be removed cleanly post-handoff if Lakebridge prefers.
export const feedbackItems = pgTable("feedback_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  section: text("section").notNull(),
  pagePath: text("page_path").notNull(),
  commitSha: text("commit_sha"),
  severity: feedbackSeverityEnum("severity").notNull().default("suggestion"),
  comment: text("comment").notNull(),
  // Legacy single-field response. Superseded by feedback_comments (thread).
  // Kept for one deploy as a safety net; backfill seeds it as the first
  // comment on the new table, then a follow-up migration will drop it.
  response: text("response"),
  status: feedbackStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  actionedAt: timestamp("actioned_at", { withTimezone: true }),
});

export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type NewFeedbackItem = typeof feedbackItems.$inferInsert;

// Threaded comments on feedback items. Anyone with access to the item can
// post (the original submitter to follow up, the admin to reply). Author
// can edit/delete their own; the owner can override.
export const feedbackComments = pgTable("feedback_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedbackId: uuid("feedback_id")
    .notNull()
    .references(() => feedbackItems.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Captured at write time so a comment author's identity survives even if
  // their user row is later removed. Mirrors feedback_items.user_email.
  userEmail: text("user_email"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FeedbackComment = typeof feedbackComments.$inferSelect;
export type NewFeedbackComment = typeof feedbackComments.$inferInsert;
