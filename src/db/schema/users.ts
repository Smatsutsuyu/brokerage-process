import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";
import { organizations } from "./organizations";

// App-level membership row. Identity (name, email, password) lives on
// auth_user (Better Auth) and is joined when needed. Keep this table thin —
// only fields Better Auth doesn't own (org membership, role, soft-disable).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Foreign key to auth_user.id. Nullable so an owner could pre-create a
  // membership row before the invitee signs in (currently we always create
  // both together via the invite flow).
  authUserId: text("auth_user_id").unique(),
  role: userRoleEnum("role").notNull().default("viewer"),
  // Owner can disable a member without deleting them; disabled users can't
  // sign in (getCurrentUser returns null for them).
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
