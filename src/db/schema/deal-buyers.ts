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
    // Per-builder CC list — users who get copied on every email blast
    // sent to this builder (e.g. Loan + Tim get CC'd on all Lennar
    // emails). Stored as a uuid array rather than a join table; FK
    // integrity isn't enforced per-element so a deleted user's id may
    // linger here, but the read path filters those out by joining to
    // users at query time. Default empty.
    ccUserIds: uuid("cc_user_ids").array().notNull().default([]),
    calledAt: timestamp("called_at", { withTimezone: true }),
    // Set when this builder has signed the Confidentiality Agreement for
    // the deal. Tracking-only at the moment (no workflow gate); reference
    // it later when filtering blasts that should only go to Confi-signed
    // recipients.
    confiSignedAt: timestamp("confi_signed_at", { withTimezone: true }),
    omSentAt: timestamp("om_sent_at", { withTimezone: true }),
    // Set when this builder has submitted their offer. Used by the
    // Phase 2 "Follow up Missing Offers" blast to filter out builders
    // who already responded; surfaced as a checkbox on the buyer card
    // alongside Called / OM toggles.
    offerReceivedAt: timestamp("offer_received_at", { withTimezone: true }),
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
