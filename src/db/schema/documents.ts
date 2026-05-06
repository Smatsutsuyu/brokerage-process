import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { checklistItems } from "./checklist";
import { deals } from "./deals";
import { documentStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  // The checklist item this document satisfies. Nullable because not every
  // document needs to be tied to a checklist row (ad-hoc deal docs may land
  // here later). When the item is deleted, the doc orphans rather than
  // cascade-deleting — preserves the file so a user can re-attach.
  checklistItemId: uuid("checklist_item_id").references(() => checklistItems.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  type: text("type"),
  version: integer("version").notNull().default(1),
  // Default to "final" — Phase 1 doesn't surface draft/final UX (see
  // status log). Schema keeps the column so we can promote it later
  // without a migration.
  status: documentStatusEnum("status").notNull().default("final"),
  // Blob storage URL (Vercel Blob). Column kept as r2_key for migration
  // continuity — the pivot from R2 to Vercel Blob (2026-05-05) was a
  // vendor swap, not a data-model change.
  r2Key: text("r2_key"),
  externalUrl: text("external_url"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
