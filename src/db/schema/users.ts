import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";
import { organizations } from "./organizations";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Foreign key to auth_user.id (Better Auth's user table). Nullable so an
  // owner can pre-create a membership row before the invitee signs in for
  // the first time; it's filled in once their auth account is created.
  authUserId: text("auth_user_id").unique(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: userRoleEnum("role").notNull().default("viewer"),
  // Owner can disable a member without deleting them; disabled users can't sign in.
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
