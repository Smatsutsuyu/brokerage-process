import {
  boolean,
  date,
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
  // User-entered working notes for this item. Separate from `description`
  // (which is the canonical item description from the seed) so the user's
  // notes are clearly authored content vs. boilerplate.
  notes: text("notes"),
  // Milestone dates attached to the item. Only surfaced in the UI when
  // the template flags the item with `dateField: true` (Offering Date,
  // Schedule SOO Review, Send out B&F, and the seven Phase 4 CTC / IC /
  // Feasibility / Closing milestones). Date-only, no time-of-day: these
  // track when a thing happened or is scheduled, not a precise moment.
  //
  // Two columns, but ONE date in the UI since 2026-09-07. The row shows a
  // single date plus an "Est." checkbox, and the checkbox decides which
  // column the write lands in:
  //
  //   Est. ticked   -> estimated_date holds it, tracked_date cleared
  //   Est. unticked -> tracked_date holds it, estimated_date left frozen
  //
  // The columns stayed because the gap between them is the only record of
  // slip, and freezing the projection when it is promoted is what captures
  // that gap without asking anyone to maintain two fields. Chris asked for
  // two chips first, then for one, after finding two too fiddly in practice.
  //
  // Read side is `tracked_date ?? estimated_date`, which is what every
  // consumer and the overdue check already did, so the UI change needed no
  // migration and moved no data.
  //
  // `trackedDate` is the ACTUAL date and keeps its column name because
  // every existing row already holds a real date Chris entered as things
  // happened. Renaming it would have meant a rename-vs-drop migration
  // for no gain.
  trackedDate: date("tracked_date"),
  estimatedDate: date("estimated_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// External-link attachments per checklist item (Dropbox / SharePoint /
// Drive URLs etc.). Replaces the prior single externalLinkUrl/label
// columns on checklist_items so an item can carry many references — same
// stacking model as documents per item. Cascade-deletes with the parent
// item; sortOrder lets the UI show stable order.
export const checklistItemLinks = pgTable("checklist_item_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  checklistItemId: uuid("checklist_item_id")
    .notNull()
    .references(() => checklistItems.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
export type ChecklistItemLink = typeof checklistItemLinks.$inferSelect;
export type NewChecklistItemLink = typeof checklistItemLinks.$inferInsert;
export type ChecklistItemDependency = typeof checklistItemDependencies.$inferSelect;
export type NewChecklistItemDependency = typeof checklistItemDependencies.$inferInsert;
