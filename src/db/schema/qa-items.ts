import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { organizations } from "./organizations";
import { users } from "./users";

export const qaItems = pgTable("qa_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer"),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type QaItem = typeof qaItems.$inferSelect;
export type NewQaItem = typeof qaItems.$inferInsert;
