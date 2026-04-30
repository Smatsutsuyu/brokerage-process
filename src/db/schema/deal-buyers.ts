import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { builders } from "./builders";
import { deals } from "./deals";
import { buyerTierEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const dealBuyers = pgTable(
  "deal_buyers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "restrict" }),
    tier: buyerTierEnum("tier").notNull().default("not_selected"),
    leadUserId: uuid("lead_user_id").references(() => users.id, { onDelete: "set null" }),
    calledAt: timestamp("called_at", { withTimezone: true }),
    omSentAt: timestamp("om_sent_at", { withTimezone: true }),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("deal_buyer_unique").on(t.dealId, t.builderId)],
);

export type DealBuyer = typeof dealBuyers.$inferSelect;
export type NewDealBuyer = typeof dealBuyers.$inferInsert;
