import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { builderClassificationEnum } from "./enums";
import { organizations } from "./organizations";

export const builders = pgTable("builders", {
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
});

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
