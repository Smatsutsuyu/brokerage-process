import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { builderClassificationEnum } from "./enums";
import { organizations } from "./organizations";

export const builders = pgTable(
  "builders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    classification: builderClassificationEnum("classification").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Prevent case-insensitive / whitespace-different duplicate builder
    // names within an org. App-level guards (createBuilder, the addContact
    // newBuilderName flow, and the deal-page "create new buyer" actions)
    // do a find-or-create on the same normalized key so the user gets a
    // useful path rather than a constraint violation, but the index is
    // the ultimate enforcement.
    uniqueIndex("builders_org_name_unique").on(t.orgId, sql`lower(trim(${t.name}))`),
  ],
);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Builder is now optional — contacts can exist standalone (imported from
  // Excel, hand-entered for a person we know but haven't tied to a builder yet)
  // and get a builder later, or change builders. When the builder is deleted
  // the contact orphans rather than cascading away (set null preserves the
  // person record we collected).
  builderId: uuid("builder_id").references(() => builders.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  // Geographic market(s) the contact covers — free text per Chris (e.g. "SoCal",
  // "Bay Area + Sacramento"). Imported from the Excel template's Geography column;
  // also editable via the contact form.
  geography: text("geography"),
  notes: text("notes"),
  // Per-contact opt-in for marketing email blasts. Default true (most
  // imported contacts are buyer-side reps we want to talk to). Setting
  // false excludes the contact from EVERY blast filter — even when their
  // builder + tier match — so it acts as a hard do-not-contact at the
  // individual level.
  receivesCommunication: boolean("receives_communication").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Builder = typeof builders.$inferSelect;
export type NewBuilder = typeof builders.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
