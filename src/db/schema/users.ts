import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  // Optional phone number. Surfaces in the Deal Team Roster (Broker Team
  // members linked to a user). User self-manages from /profile; admin
  // can also set it at invite time. Better Auth doesn't model phone on
  // auth_user so it lives here on our app-level membership row.
  phone: text("phone"),
  // Owner can disable a member without deleting them; disabled users can't
  // sign in (getCurrentUser returns null for them).
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  // Developer-mode flag. When true, this user receives dev-team
  // notifications (new feedback, comments). Self-toggleable from /profile
  // and only meaningful for owners — non-owners with the flag set are
  // ignored by the notification query. Defaults false so new accounts
  // never get notification spam without opting in.
  isDeveloper: boolean("is_developer").notNull().default(false),
  // Per-channel notification preferences. Default true so enabling
  // developer mode immediately turns the firehose on; user can mute either
  // channel from /profile. Only consulted when isDeveloper = true.
  notifyOnNewFeedback: boolean("notify_on_new_feedback").notNull().default(true),
  notifyOnNewComment: boolean("notify_on_new_comment").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
