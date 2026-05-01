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
  status: feedbackStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  actionedAt: timestamp("actioned_at", { withTimezone: true }),
});

export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type NewFeedbackItem = typeof feedbackItems.$inferInsert;
