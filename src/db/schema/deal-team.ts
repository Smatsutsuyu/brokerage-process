import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { contacts } from "./builders";
import { deals } from "./deals";
import { dealTeamEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// One row per Deal Team member, scoped to a deal. Polymorphic across the
// three sub-teams: Owner Team (sellers/principals), Broker Team (the deal
// team for this deal — Lakebridge folks plus outside cobrokers), Buyer
// Team (the chosen buyer's people, typically emerging post-LOI).
//
// Identity comes from one of three sources, in priority order:
//   1. userId   — links to an org user (Lakebridge employee)
//   2. contactId — links to a row in the contacts directory
//   3. free-text name/email/phone in the row itself (Owner Team
//      primarily, since sellers/principals aren't modeled elsewhere yet)
//
// The CHECK constraint enforces that every row has SOME identity. The
// free-text columns are nullable so FK-linked rows don't duplicate the
// canonical name/email/phone (that comes from the join at read time).
//
// `roleLabel` is per-deal context (Cobroker, Marketing Coordinator,
// Owner's Counsel, etc.) and lives on the team row regardless of
// identity source — the same person can be on multiple deals with
// different roles.
//
// `includeInEmails` is the "Checked Deal Team" concept from the Excel
// roster: per-row toggle that decides whether the email composer pulls
// this person as a recipient. Default true.
export const dealTeamMembers = pgTable(
  "deal_team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    team: dealTeamEnum("team").notNull(),
    roleLabel: text("role_label").notNull(),
    notes: text("notes"),
    includeInEmails: boolean("include_in_emails").notNull().default(true),
    // Canonical-source links. Set null on delete so the team record
    // survives even if the canonical source is removed (the row falls
    // back to its free-text columns if any are populated).
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    // Free-text identity, used only when neither FK is set. Nullable
    // so FK-linked rows don't duplicate the canonical record.
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "deal_team_member_has_identity",
      sql`${t.userId} IS NOT NULL OR ${t.contactId} IS NOT NULL OR ${t.name} IS NOT NULL`,
    ),
  ],
);

export type DealTeamMember = typeof dealTeamMembers.$inferSelect;
export type NewDealTeamMember = typeof dealTeamMembers.$inferInsert;
