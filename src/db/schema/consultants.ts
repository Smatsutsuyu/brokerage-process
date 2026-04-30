import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { consultantRoleEnum, consultantSideEnum } from "./enums";
import { organizations } from "./organizations";

export const consultants = pgTable("consultants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  role: consultantRoleEnum("role").notNull(),
  side: consultantSideEnum("side").notNull(),
  firmName: text("firm_name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Consultant = typeof consultants.$inferSelect;
export type NewConsultant = typeof consultants.$inferInsert;
