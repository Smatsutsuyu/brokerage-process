import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { dealPriorityEnum, psaDraftingEnum } from "./enums";
import { organizations } from "./organizations";

// No phase/status field — workflow phase is implicit in the checklist
// (each item lives in a phase). Sidebar derives a "current phase" chip
// from incomplete items.
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
  priority: dealPriorityEnum("priority").notNull().default("normal"),
  notes: text("notes"),
  // PSA Attorney decision — captured inline on the "Determine PSA Attorney"
  // checklist row. Each deal has at most one such decision; storing on the
  // deal (rather than as a consultant row) keeps it visible to the workflow
  // surface where it's actually decided.
  psaAttorneyName: text("psa_attorney_name"),
  psaAttorneyFirm: text("psa_attorney_firm"),
  psaDrafting: psaDraftingEnum("psa_drafting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
