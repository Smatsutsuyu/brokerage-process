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
  // Set by resetMemberPassword when an owner resets a member's password.
  // While true, the (app) layout gate redirects any request through
  // /set-password and blocks all other routes until the user picks a new
  // password of their own. Cleared inside setOwnPassword once a valid new
  // one lands. The reset action also revokes existing sessions so a stale
  // browser tab can't slip past the gate.
  mustSetPassword: boolean("must_set_password").notNull().default(false),
  // Per-channel feedback notification preferences. All four are
  // owner-only (the /profile section is gated on role === "owner" and the
  // recipient queries in lib/email/notify.ts filter by role too).
  //
  // notifyOnNewFeedback: "subscribe to the feed" — pinged on any new
  //   feedback submission. Off by default (opt-in firehose).
  // notifyOnNewComment: pinged on new comments on threads I've previously
  //   participated in (commented on). Off by default (opt-in).
  // notifyOnReplyToMine: pinged on replies to feedback I created.
  //   Off by default — opt in from /profile.
  // notifyOnStatusChangeToMine: pinged on status changes to feedback I
  //   created. Off by default — opt in from /profile.
  notifyOnNewFeedback: boolean("notify_on_new_feedback").notNull().default(false),
  notifyOnNewComment: boolean("notify_on_new_comment").notNull().default(false),
  notifyOnReplyToMine: boolean("notify_on_reply_to_mine").notNull().default(false),
  notifyOnStatusChangeToMine: boolean("notify_on_status_change_to_mine")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
