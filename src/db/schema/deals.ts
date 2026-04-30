import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { dealPriorityEnum, dealStatusEnum } from "./enums";
import { organizations } from "./organizations";

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  units: integer("units"),
  city: text("city"),
  state: text("state"),
  type: text("type"),
  status: dealStatusEnum("status").notNull().default("phase_1"),
  priority: dealPriorityEnum("priority").notNull().default("medium"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
