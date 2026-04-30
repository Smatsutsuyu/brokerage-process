import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { checklistPhaseEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const checklistCategories = pgTable("checklist_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  phase: checklistPhaseEnum("phase").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => checklistCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  optional: boolean("optional").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  externalLinkUrl: text("external_link_url"),
  externalLinkLabel: text("external_link_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const checklistItemDependencies = pgTable(
  "checklist_item_dependencies",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => checklistItems.id, { onDelete: "cascade" }),
    dependsOnItemId: uuid("depends_on_item_id")
      .notNull()
      .references(() => checklistItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.dependsOnItemId] })],
);

export type ChecklistCategory = typeof checklistCategories.$inferSelect;
export type NewChecklistCategory = typeof checklistCategories.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
export type ChecklistItemDependency = typeof checklistItemDependencies.$inferSelect;
export type NewChecklistItemDependency = typeof checklistItemDependencies.$inferInsert;
