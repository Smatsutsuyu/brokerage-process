# Database Schema Reference

A working reference for any developer modifying the data layer of the Lakebridge brokerage-process platform. Covers conventions, the table inventory, the auto-applied checklist template framework, common change recipes, and the gotchas that have bitten us so far.

## At a glance

Postgres (hosted on Neon, accessed via the Vercel ↔ Neon marketplace integration). Drizzle ORM defines the schema in TypeScript under `src/db/schema/*.ts`. Database columns are snake_case; TypeScript reads camelCase. Drizzle bridges the two via `casing: "snake_case"` in `drizzle.config.ts`. Migration files live in `src/db/migrations/` and are auto-applied on every Vercel deploy by the `vercel-build` script.

Multi-tenancy is structural: every domain table carries an `org_id` foreign key with `onDelete: cascade`. Single tenant at launch (Lakebridge), but the architecture supports isolated environments. Never write a query that doesn't filter by `org_id` (the helper in `src/lib/auth/get-current-org.ts` returns the active org for every request).

Current migration count: 29 (`0000` through `0028`). Migration `0000_flawless_masked_marvel.sql` is a collapsed baseline from 2026-05-04 reflecting the schema at that point. Everything since is incremental.

## Conventions

Every table follows the same rules. Memorize these so review goes faster.

1. **Primary keys** are UUIDs, defaulted with `gen_random_uuid()` (Postgres 13+ built-in). Composite primary keys are used for pure join tables (`checklist_item_dependencies`, `deal_contacts`, `user_deal_orders`).
2. **Tenancy:** `org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` on every multi-tenant table. The cascade means deleting an org cleans everything up; we never expect to use it in production, but the constraint keeps test data tidy.
3. **User foreign keys** use `onDelete: set null`. We preserve history (who completed a checklist item, who approved a Q&A, who logged an audit entry) even if the user row is removed. The same applies to author-style columns like `feedback_items.user_id` and `feedback_comments.user_id`.
4. **Builder foreign keys from `deal_buyers`** use `onDelete: restrict`. You can't delete a builder that's actively in a deal. From `contacts`, `builder_id` is now nullable and uses `onDelete: set null` (a contact orphans rather than disappearing).
5. **Timestamps** are `with timezone`. `created_at` defaults to `now()`; `updated_at` defaults to `now()` and uses Drizzle's `$onUpdate(() => new Date())` so every write bumps it. Read-only audit tables (e.g. `audit_log`) only have `created_at`.
6. **Naming:** snake_case in Postgres, camelCase in TypeScript. Drizzle reads `casing: "snake_case"` from `drizzle.config.ts` and translates automatically. Don't override column names with explicit string arguments unless the DB name needs to differ (e.g. `documents.r2_key` retains its name across the R2 to Vercel Blob vendor swap on 2026-05-05).
7. **Type exports** at the bottom of every schema file: `export type X = typeof xTable.$inferSelect; export type NewX = typeof xTable.$inferInsert;`. Use these everywhere; never re-declare row shapes by hand.

## Table inventory

Grouped by domain. One line of purpose, then notable columns and FK relationships.

### Identity and tenancy

- **`organizations`** (`src/db/schema/organizations.ts`) — top-level tenant. Columns: `id`, `clerk_org_id` (vestigial unique field, kept for migration continuity after the Better Auth swap), `name`, `slug`. Every domain table cascades from here.
- **`users`** (`src/db/schema/users.ts`) — app-level membership row. One row per (org, person) pair. Columns: `org_id`, `auth_user_id` (text FK to `auth_user.id`, nullable for pre-created memberships), `role` (`user_role` enum), `phone`, `disabled_at` (soft-disable without delete), and four `notify_on_*` boolean flags for the owner's feedback notification subscriptions.
- **`auth_user`**, **`auth_session`**, **`auth_account`**, **`auth_verification`** (`src/db/schema/auth.ts`) — the four Better Auth tables. Owned by the library; schema matches its canonical layout so its Drizzle adapter recognizes them. Identity (name, email, password hash, OAuth tokens) lives on `auth_user`; sessions and OAuth account links live on the others. `users.auth_user_id` joins back to `auth_user.id`.

### Deals and buyers

- **`deals`** (`src/db/schema/deals.ts`) — one row per brokerage deal. Columns: `name`, `units`, `city`, `state`, `type`, `priority` (`deal_priority` enum), `notes`, and the PSA decision trio (`psa_attorney_name`, `psa_attorney_firm`, `psa_drafting`). Banner image path (`banner_image_path`) is the Vercel Blob pathname used in generated PDF headers. Note: no `phase`/`status` column. Phase is implicit in the checklist (each item lives in a phase, and the sidebar derives a "current phase" chip from incomplete items).
- **`builders`** (`src/db/schema/builders.ts`) — companies. Columns: `name`, `classification` (`builder_classification` enum: private / public / developer), `notes`. Has a unique index `builders_org_name_unique` on `(org_id, lower(trim(name)))` to prevent case-insensitive duplicates within an org.
- **`contacts`** (`src/db/schema/builders.ts`, colocated with builders) — people. Columns: `builder_id` (nullable, `onDelete: set null`), `first_name`, `last_name`, `title`, `email`, `phone`, `geography` (free-text market coverage), `notes`, `receives_communication` (per-contact hard do-not-contact toggle).
- **`deal_buyers`** (`src/db/schema/deal-buyers.ts`) — per-deal builder tagging. Composite unique on `(deal_id, builder_id)`. Carries per-deal `tier` (`buyer_tier` enum: green / yellow / red / not_selected), `lead_user_id`, a `cc_user_ids uuid[]` for per-builder CC lists on email blasts, and tracking timestamps: `called_at`, `confi_signed_at`, `om_sent_at`, `offer_received_at`, plus per-builder `comments`.
- **`deal_contacts`** (`src/db/schema/deal-contacts.ts`) — explicit per-person assignment of a contact to a deal. Composite PK on `(deal_id, contact_id)`. Added in the 2026-05-11 deal-contacts model rework: previously, any contact at a deal's builder auto-appeared on the deal, which surfaced people the user never opted to add. Now a builder "appears on a deal" only when at least one of its contacts has a `deal_contacts` row.
- **`user_deal_orders`** (`src/db/schema/user-deal-orders.ts`) — per-user sidebar ordering. Composite PK on `(user_id, deal_id)`. A row exists for every deal the user has explicitly reordered; unordered deals sort alphabetically at the bottom. Renumbered dense on each move.

### Checklist

- **`checklist_categories`** (`src/db/schema/checklist.ts`) — phase-scoped containers. Columns: `deal_id`, `phase` (`checklist_phase` enum: phase_1 to phase_4), `name`, `sort_order`.
- **`checklist_items`** — leaf rows. Columns: `category_id`, `name`, `description` (canonical text from the template), `notes` (user-authored working notes, separate field on purpose), `optional`, `sort_order`, `completed`, `completed_at`, `completed_by`, `tracked_date` (date-only milestone field, surfaced only when the template flags the item with `dateField: true`).
- **`checklist_item_links`** — many external links per item (Dropbox, SharePoint, Drive). Columns: `checklist_item_id` (`onDelete: cascade`), `url`, `label`, `sort_order`. Replaced the prior single `external_link_url`/`label` columns on `checklist_items`.
- **`checklist_item_dependencies`** — many-to-many prerequisite enforcement. Composite PK on `(item_id, depends_on_item_id)`.

### Workflow artifacts

- **`qa_items`** (`src/db/schema/qa-items.ts`) — Q&A workflow. Columns: `deal_id`, `question`, `answer`, `approved`, `approved_at`, `approved_by`.
- **`issues`** (`src/db/schema/issues.ts`) — Phase 4 issues tracker. Columns: `deal_id`, `title`, `description`, `status` (`issue_status` enum), `priority` (`issue_priority` enum), `assigned_user_id`, `identified_at`, `resolved_at`.
- **`consultants`** (`src/db/schema/consultants.ts`) — consultant roster. Columns: `deal_id`, `role` (`consultant_role` enum, 13 values), `side` (`consultant_side` enum: buyer / seller), `firm_name`, contact info, `notes`. Flat by design (per CLAUDE.md note 16: informative metadata, not a primary feature).
- **`deal_team_members`** (`src/db/schema/deal-team.ts`) — polymorphic deal team. Columns: `deal_id`, `team` (`deal_team` enum: owner / broker / buyer), `role_label`, `include_in_emails`, plus three identity sources (set whichever one applies, the others stay null): `user_id` (org user FK), `contact_id` (contacts FK), or free-text `name`/`email`/`phone`. A CHECK constraint `deal_team_member_has_identity` enforces at least one identity is present.
- **`documents`** (`src/db/schema/documents.ts`) — uploaded files and external links. Columns: `deal_id`, `checklist_item_id` (nullable, `onDelete: set null` so docs orphan rather than disappear when an item is dropped), `name`, `type`, `version`, `status` (`document_status` enum), `r2_key` (Vercel Blob pathname; column name preserved for migration continuity), `external_url`, `mime_type`, `size_bytes`, `uploaded_by`, `uploaded_at`.

### Feedback

- **`feedback_items`** (`src/db/schema/feedback.ts`) — in-app feedback submissions. Gated by `NEXT_PUBLIC_FEEDBACK_ENABLED`; designed to be removable cleanly post-handoff. Columns: `section`, `page_path`, `commit_sha`, `severity` (`feedback_severity` enum), `comment`, `response` (legacy single-field, superseded by `feedback_comments`), `status` (`feedback_status` enum), `reviewed_at`, `actioned_at`, `last_updated_by`.
- **`feedback_comments`** — threaded replies. Columns: `feedback_id` (`onDelete: cascade`), `user_id`, `user_email` (captured at write time so identity survives if the user is later removed), `body`.
- **`feedback_attachments`** — files attached to a feedback item. Columns: `feedback_id` (`onDelete: cascade`), `name` (original filename for the Content-Disposition header), `mime_type`, `size_bytes`, `blob_path` (Vercel Blob pathname), `uploaded_by`.

### Misc

- **`audit_log`** (`src/db/schema/audit-log.ts`) — append-only audit trail. Columns: `org_id`, `user_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `metadata jsonb`. Only `created_at`, no `updated_at`.

## Enums

Defined in `src/db/schema/enums.ts`. All exported as `pgEnum`s so Drizzle generates the Postgres `CREATE TYPE` statements.

- **`user_role`**: `owner`, `broker`, `analyst`, `viewer`.
- **`deal_priority`**: `normal`, `high`.
- **`psa_drafting`**: `buyer`, `seller`, `na`.
- **`builder_classification`**: `private`, `public`, `developer` (`developer` added 2026-05-12).
- **`buyer_tier`**: `green`, `yellow`, `red`, `not_selected`.
- **`checklist_phase`**: `phase_1`, `phase_2`, `phase_3`, `phase_4`.
- **`issue_status`**: `open`, `in_progress`, `resolved`.
- **`issue_priority`**: `low`, `medium`, `high`, `urgent`.
- **`consultant_side`**: `buyer`, `seller`.
- **`deal_team`**: `owner`, `broker`, `buyer`.
- **`consultant_role`**: `landscape_architect`, `civil_engineer`, `soils_engineer`, `cost_to_complete`, `hoa`, `dry_utility`, `phase_1_environmental`, `land_use`, `biologist`, `architect`, `psa_attorney`, `title`, `escrow` (the last two added in migration `0028`).
- **`document_status`**: `draft`, `final`.
- **`feedback_severity`**: `nit`, `suggestion`, `bug`, `blocker`.
- **`feedback_status`**: `new`, `reviewed`, `actioned`, `complete`, `wontfix`.

## Key relationships

Most FKs follow obvious chains. The non-obvious ones:

- **User identity:** `users` (membership row) joins to `auth_user` (Better Auth identity row) via `users.auth_user_id`. Email, name, password, and OAuth bindings live on `auth_user`. Role, phone, notification preferences, and `disabled_at` live on `users`. To look up a sign-in's role, join both. Membership rows can exist without an `auth_user_id` (pre-created invite), but the user can't sign in until linked.
- **Deal contacts:** A contact reaches a deal in two independent ways. `deal_buyers(deal_id, builder_id)` tags the builder for the deal with a tier; `deal_contacts(deal_id, contact_id)` adds specific people. A builder "appears as a buyer card" on a deal when at least one of its contacts has a `deal_contacts` row for the deal; the query layer derives this, no flag column.
- **Checklist hierarchy:** `deals → checklist_categories → checklist_items`. Items optionally have `checklist_item_dependencies` (prerequisite items in the same deal) and `checklist_item_links` (external URLs). Documents attach via `documents.checklist_item_id` (nullable).
- **Deal team identity:** `deal_team_members` is polymorphic. The row holds `user_id` for Lakebridge employees, `contact_id` for buyer/seller-side contacts, or free-text name/email/phone (Owner Team principals not modeled elsewhere). Read paths join all three and pick whichever is non-null in priority order.
- **Builder uniqueness:** within an org, builder names are unique case-insensitively via `builders_org_name_unique` on `(org_id, lower(trim(name)))`. App-level create paths do a find-or-create on the same normalized key.

## The checklist template framework

The checklist content is not stored in the database as fixture data. It's defined in code at `src/db/checklist-template.ts` and reconciled into every deal automatically.

- **`src/db/checklist-template.ts`** is the canonical source of truth. Adding a new checklist item means editing this file.
- **`src/scripts/reconcile-checklists.ts`** is additive. On every deploy, for every deal, it inserts items present in the template but missing on the deal (at the correct position, not appended) and updates `sort_order` when it drifts. Existing item rows survive the reorder with their `completed`/`notes`/`attachments` intact. Items on the deal that aren't in the template are preserved at the end of their category, never deleted. Same three rules apply to categories.
- **`src/scripts/apply-renames.ts`** is the explicit history of every rename, delete, category-merge, and item-move ever applied. Idempotent: re-running matches no rows the second time. Append a new block for each evolution pass; do not edit history. Runs before `reconcile-checklists` so the data lines up with the current template before reconcile reads it.

Recipe for changing the checklist:

1. To **add an item**: edit `CHECKLIST_TEMPLATE`, push. The next deploy adds it to every existing deal at the correct position.
2. To **rename an item**: edit the template AND append a `{ type: "item", ... }` block to `RENAMES` in `apply-renames.ts`. Required because reconcile is name-keyed; a rename without an apply-renames entry would surface the new name as an addition while the old name lingers as an "extra".
3. To **delete an item from the template**: append a `{ type: "delete-item", ... }` block to `RENAMES`. Cascade-deletes attached links; attached documents survive as orphans (their `checklist_item_id` becomes null).

Per the always-backfill memory, after editing the template, run `npm run checklist:reconcile` locally as a dry run, then against prod. The `vercel-build` script runs it on every deploy too.

## Common change recipes

Recipe-style. Read once, internalize.

### Add a new field to an existing table

Example: a new `closing_date` column on `deals`.

1. Edit `src/db/schema/deals.ts`, add the column.
2. `npm run db:generate` — Drizzle inspects the schema and writes a new SQL migration file and snapshot.
3. Open the generated migration file in `src/db/migrations/`. Sanity-check the SQL.
4. `npm run db:migrate` to apply locally.
5. Commit both the schema change and the migration file. The Vercel deploy applies it to prod.

### Add a new table

1. Create a new file in `src/db/schema/` (e.g. `src/db/schema/widgets.ts`). Define the table with the standard conventions (`org_id`, UUID PK, timestamps, type exports).
2. Add `export * from "./widgets";` to `src/db/schema/index.ts`.
3. If the table references existing tables, include those FKs in the schema definition (Drizzle generates the `REFERENCES` clauses).
4. `npm run db:generate`, inspect, `npm run db:migrate`.

### Add a new enum value

Example: adding `architect_landscape` to `consultant_role`.

1. Edit `src/db/schema/enums.ts`, add the value to the list.
2. `npm run db:generate`. The generated migration uses `ALTER TYPE ... ADD VALUE`, one statement per value (Postgres requires enum value additions outside a transaction; Drizzle handles the split). See migration `0028_glossy_living_lightning.sql` for an example (`title` and `escrow` added on separate statements).
3. `npm run db:migrate`. Commit.

### Change a column default and backfill existing rows

When the new default should also apply to historical rows, write the UPDATE as DML inside the same migration file. See migration `0026_notifications_all_off.sql` for the pattern: two `ALTER TABLE ... SET DEFAULT` statements followed by a single `UPDATE users SET ...` that resets every existing row. Drizzle generates the ALTERs; the UPDATE is hand-added after generation. Re-run `npm run db:migrate` locally to verify.

## Gotchas

The sharp edges. These have all bitten us before.

- **`npm run db:push` is destructive and skips migration history.** It writes the schema delta directly to the DB without producing a migration file. Don't use it except for throwaway test DBs. Per the reference memory: DML inside a migration file silently no-ops when you push (the file isn't read), and then breaks the Vercel build because prod still runs through `drizzle-kit migrate` which expects the DML to have been applied.
- **`npm run db:generate` may prompt for rename-vs-drop disambiguation.** When a column is renamed in TypeScript, Drizzle can't tell whether you renamed it or dropped one and added another. The CLI normally prompts interactively. In a non-TTY environment (CI, some shells) the prompt doesn't surface and the command may default to drop-and-add, which silently destroys data. If you suspect this, write the migration SQL plus the `meta/*.json` snapshot by hand. See the migration `0025` commit history for the pattern.
- **The `vercel-build` script chain is `drizzle-kit migrate && npm run rename:apply && npm run checklist:reconcile && next build`.** A failure at any step breaks the deploy. Test locally first by running each command in order against a fresh DB.
- **`auth_user` is owned by Better Auth.** Don't add columns to it (they'll conflict with future Better Auth schema updates). Add new identity-adjacent columns to the `users` table instead. The `phone` field on `users` is an example: Better Auth doesn't model phone, so it lives on our app-level membership row.
- **Snapshot files in `src/db/migrations/meta/` chain via `prevId`.** Each snapshot has a unique `id` and a `prevId` pointing at the previous one. If you hand-write a snapshot (rare, but see the rename-disambiguation gotcha above), generate a new UUID for `id` and set `prevId` to the previous snapshot's `id`. A broken chain makes `db:generate` think the schema is out of sync.
- **Per-deal data does not cascade from the template.** Deleting a row from `CHECKLIST_TEMPLATE` does not delete checklist items on existing deals. You must append a `delete-item` block to `apply-renames.ts`.
- **Vercel CLI env quirks for prod scripts.** Per the reference memory: `vercel env pull` and `vercel env run` both skip Sensitive vars AND layer `.env.local` over the cloud env. For prod-DB scripts (`checklist:reconcile`, `rename:apply`, ad-hoc backfills), set `DATABASE_URL` inline on the command (`DATABASE_URL='postgres://...prod...' npm run checklist:reconcile`) rather than relying on `vercel env` to load it.

## Migration count and history

29 migration files (`0000` through `0028`) as of 2026-05-15.

- **`0000_flawless_masked_marvel.sql`** — collapsed baseline (commit `4e742ec`, 2026-05-04). Replaces the earlier migration history accumulated during initial scaffold; reflects the schema as of that date.
- **`0008_round_valeria_richards.sql`** — `feedback_comments` table plus the DML backfill that turns the legacy `feedback_items.response` single-field into the first comment of each thread (2026-05-11). The follow-up commit `c5cbe64` fixed a join against `auth_user` for the email column when the original migration assumed `users.email` (it doesn't exist; identity lives on `auth_user`).
- **`0025_owner_feedback_subscriptions.sql`** — added `notify_on_reply_to_mine` and `notify_on_status_change_to_mine` columns and dropped the old `users.is_developer` flag (2026-05-15). The dropped column had become redundant once email recipients moved to the per-channel notification model.
- **`0026_notifications_all_off.sql`** — flipped all four `notify_on_*` defaults to false and ran a single `UPDATE` to reset every existing row (2026-05-15). Example of the column-default-plus-backfill pattern.
- **`0027_user_deal_orders.sql`** — added the `user_deal_orders` join table for per-user sidebar deal ordering (2026-05-15).
- **`0028_glossy_living_lightning.sql`** — added `title` and `escrow` to the `consultant_role` enum (2026-05-15). Each value added on its own statement, as Postgres requires.
