import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { dealTeamMembers } from "./deal-team";
import { deals } from "./deals";
import { issuePriorityEnum, issueStatusEnum } from "./enums";
import { organizations } from "./organizations";

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: issueStatusEnum("status").notNull().default("open"),
  priority: issuePriorityEnum("priority").notNull().default("medium"),
  // Assignee is a Deal Team member (any sub-team, any identity source: user,
  // contact, or free-text). Display name is resolved through the polymorphic
  // identity chain at read time. onDelete: set null so removing someone from
  // the Deal Team downgrades the issue to unassigned rather than deleting it.
  assigneeTeamMemberId: uuid("assignee_team_member_id").references(
    () => dealTeamMembers.id,
    { onDelete: "set null" },
  ),
  identifiedAt: timestamp("identified_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
