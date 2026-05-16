import { integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { users } from "./users";

// Per-user custom ordering of the sidebar deal list. A row exists for
// every deal the user has explicitly reordered; unordered deals sort to
// the bottom alphabetically. Whole ordering is renumbered dense on each
// move (cheap for the < 50-deal scale).
export const userDealOrders = pgTable(
  "user_deal_orders",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dealId] })],
);

export type UserDealOrder = typeof userDealOrders.$inferSelect;
export type NewUserDealOrder = typeof userDealOrders.$inferInsert;
