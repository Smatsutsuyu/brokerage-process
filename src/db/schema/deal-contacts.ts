import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { contacts } from "./builders";
import { deals } from "./deals";
import { organizations } from "./organizations";

// Explicit per-person assignment of a contact to a deal. Replaces the
// previous builder-implied model where any contact at a deal-builder
// auto-appeared on the deal — that surfaced people the user never opted
// to add. Per Chris's feedback (2026-05-12): adding one Lennar contact
// shouldn't drag in the other four.
//
// Builder grouping in the UI is still derived from contact.builder_id,
// but presence on the deal is now this table's responsibility. A builder
// "appears on a deal" when at least one of its contacts has a
// deal_contacts row for that deal — purely derived in the query layer,
// no separate flag.
export const dealContacts = pgTable(
  "deal_contacts",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // A contact can only be on a deal once. Composite PK doubles as the
    // uniqueness constraint and the lookup index.
    pk: primaryKey({ columns: [t.dealId, t.contactId] }),
  }),
);

export type DealContact = typeof dealContacts.$inferSelect;
export type NewDealContact = typeof dealContacts.$inferInsert;
