import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  name: text("name").notNull(),
  type: text("type"),
  version: integer("version").notNull().default(1),
  status: documentStatusEnum("status").notNull().default("draft"),
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
