# Status Log — Lakebridge Capital Deal Lifecycle Platform

Running record of work, decisions, deferrals, and blockers. Newest day at top. Source for on-demand status reports (daily, weekly, client-facing, etc.).

---

## 2026-04-30 — Day 6-7: App shell + Clerk skeleton

### Done
- Read prototype HTML carefully — UI source of truth (sidebar 260px white, dark navy priority ribbon up top with amber accent, main content with deal header + 5-tab nav, phase color coding navy/green/purple/orange)
- Brand foundation: Inter font, Land Advisors logo SVG component (layered mountain in ink box + wordmark), brand CSS vars in `globals.css` consumed via Tailwind v4 utilities
- Clerk middleware skeleton (`middleware.ts`) — `clerkMiddleware()` passthrough; no route protection until real keys land
- App shell:
  - `src/app/(app)/layout.tsx` — priority ribbon + sidebar/main flex
  - `src/components/layout/priority-ribbon.tsx` — top dark navy bar listing pinned high-priority deals
  - `src/components/layout/sidebar.tsx` — Land Advisors brand + deal list with progress bars + priority star indicators
- Pages:
  - `/` — empty state "No deal selected"
  - `/deals/[id]` — deal header with status badge + priority star + overall progress bar, 5-tab nav (Checklist active, others "Coming in week 2-3")
  - `src/app/(app)/deals/[id]/views/checklist-view.tsx` — phase-grouped categories with items, color-coded headers, completed strikethrough
- Seed script (`src/db/seed.ts`) populating Lakebridge org, Chris's user, builders, contacts, 2 sample deals, full Phase 1 checklist, sample Q&A/issues/consultants
- `npm run db:seed` using `tsx --env-file=.env.local` (Node's native env-file flag, avoids dotenv module-hoisting issues)
- Verified: dev server runs at `localhost:3000`, both `/` and `/deals/[id]` return 200, no errors in Next.js log, all data flows from real Postgres queries

### Decisions
- **ClerkProvider intentionally NOT in root layout yet.** With placeholder `pk_test_placeholder`, Clerk SDK throws at init time. Middleware import is fine (lazy validation per request). Inline TODO in `src/app/layout.tsx` shows the snippet to drop in once real keys arrive.
- **Tab switching is client-side state**, not URL routes. Used React `useState` with the prototype's underlined-tab visual pattern. Per-tab routes (`/deals/[id]/checklist` etc.) deferred to week 2-3 if SEO/bookmarking demands it.
- **Sidebar deal list aggregates checklist progress in a single SQL query** with two LEFT JOINs to `checklist_categories` and `checklist_items`, computing total + done counts via `count() filter` aggregates. One query for the whole sidebar, scales fine at 20-50 deals.
- **`getCurrentOrg()` placeholder returns the first org in the DB.** Single-tenant for now. Once Clerk middleware enforces auth, swap to read the Clerk org from `auth()` and look up by `clerk_org_id`.
- **Switched font Geist → Inter** to match the prototype.
- **`tsx --env-file` over `dotenv.config()`** in scripts. ES module imports hoist; `import { db } ...` triggers `env.ts` validation BEFORE any subsequent `dotenv.config()` runs. Node's `--env-file` flag pre-populates `process.env` before any module loads.
- **Brand colors as CSS vars** consumed by Tailwind v4 utilities (`bg-brand-navy`, `text-brand-accent`, `bg-phase-1`, etc.). No `tailwind.config.js` needed — v4's `@theme` block generates utilities directly from CSS vars.
- **Disabled "+ New Deal" button** in sidebar with tooltip "Coming in week 2-3" — visible affordance for the eventual feature without functional UI yet.

### Deferred / Pending
- Clerk org/app provisioning (sign-in, sign-up flows) — pending Lakebridge Clerk account
- Webhook to sync Clerk users to local `users` table — pending Clerk
- CRUD operations on all entities (Deal create/edit, Contacts management, Q&A workflow, Issues tracker, Consultants roster) — week 2-3
- Document upload/generation — Phase 2
- Email send via Resend — Phase 2

### Blockers
- None active for week 2-3 work. Real Clerk keys would unblock sign-in flow but not block UI development.

### Repo state
- All committed locally; awaiting user review before pushing.

---

## 2026-04-30 — Local development environment (Docker Postgres)

### Done
- Added `docker-compose.yml` with Postgres 16-alpine (port 5432, named volume `postgres-data`, healthcheck on `pg_isready`)
- Installed `postgres` (postgres.js) as a runtime dep — local Postgres driver
- Updated `src/db/index.ts` with **runtime driver swap** based on URL: `@neondatabase/serverless` HTTP for production (Neon), `postgres.js` for local dev
- Pointed `.env.local` at the local Docker DB (`postgres://postgres:postgres@localhost:5432/brokerage_dev`)
- Added npm scripts: `db:up`, `db:down`, `db:reset` for Docker lifecycle
- Started Docker Postgres, applied migration `0000_modern_dorian_gray.sql` against local DB
- Verified all 14 tables present via `psql \dt`
- Lint and build still pass clean

### Decisions
- **Two drivers, runtime swap** (Neon HTTP for prod, postgres.js for local). Both bundled; ~runtime detect on `URL.includes("neon.tech")`. Trade-off: slightly more weight in deps; benefit: production keeps the serverless-optimized Neon driver, local dev uses standard PG. Cleanest separation.
- **Postgres 16-alpine** matches Neon's typical default version. Keeps engine parity between local and production for migrations and queries.
- **Local DB credentials are plain `postgres / postgres`** — fine for a dev-only container that's never network-accessible. Documented in `docker-compose.yml`.
- **Named volume `postgres-data`** persists data across `docker compose down`. Use `npm run db:reset` (which is `down -v && up`) to wipe and recreate from scratch.
- **Did NOT switch to a single unified driver** (postgres.js everywhere). Considered it for simplicity but kept Neon HTTP for prod since serverless cold-start performance matters for Vercel deploys.

### Notable note from migration run
- Postgres emitted a NOTICE that the FK constraint name `checklist_item_dependencies_depends_on_item_id_checklist_items_id_fk` (>63 chars) was truncated. Harmless — the constraint still works under its truncated name. Could shorten the table name in a future schema pass if it ever causes confusion.

### Deferred / Pending
- Seed script (Lakebridge org + Chris's user + sample data for local exercising) — next turn
- Real `DATABASE_URL` from Neon — still pending Lakebridge Neon account, but no longer blocking dev work

### Blockers
- None. Local dev fully unblocked.

### Repo state
- Commit `3bfaee9` pushed to `origin/main` covering Day 2 + Day 3 prep + Day 4-5 schema + local dev environment.
- Also fixed `.gitignore` to allow `.env.example` through (was caught by `.env*`).

---

## 2026-04-30 — Day 4-5: Core schema

### Done
- Wrote 12 schema files in `src/db/schema/` (one per logical entity, plus `enums.ts` and `index.ts`)
- 14 tables total: organizations, users, deals, builders, contacts, deal_buyers, checklist_categories, checklist_items, checklist_item_dependencies, qa_items, issues, consultants, documents, audit_log
- All multi-tenant tables carry `org_id` with cascade delete from organizations
- 11 Postgres enums: user_role, deal_status, deal_priority, builder_classification, buyer_tier, checklist_phase, issue_status, issue_priority, consultant_side, consultant_role (11 values), document_status
- Composite-PK many-to-many for checklist item dependencies (supports an item depending on multiple prerequisites)
- Unique constraint on `(deal_id, builder_id)` in `deal_buyers` — same builder can't be added twice to one deal
- Type exports per table: `Organization` / `NewOrganization` etc., inferred from Drizzle schema
- Wired schema into `src/db/index.ts` so the Drizzle client supports the relational query API
- Generated initial migration: `src/db/migrations/0000_modern_dorian_gray.sql` (225 lines, 14 CREATE TABLE statements + 11 CREATE TYPE + foreign keys)
- Lint and build pass clean

### Decisions
- **One schema file per logical entity**, with `enums.ts` for shared enums and `index.ts` to re-export. Easier to navigate than a single monolithic file for 14 tables; Drizzle resolves cross-file foreign-key refs via lazy `() => table.id` syntax.
- **Contacts colocated with builders** in `builders.ts` since they're tightly coupled (one builder, many contacts).
- **`checklist_item_dependencies` as a separate table** rather than a `depends_on_item_id` column on `checklist_items`. CLAUDE.md examples ("Send out OM" requires "OM" complete) imply each item could have multiple prerequisites, which only a join table supports.
- **`buyer_tier` enum includes `not_selected`** as the fourth state per resolved discovery decision (CLAUDE.md note 11).
- **`consultant_role` value `phase_1_environmental`** disambiguates from the `checklist_phase` enum's `phase_1` value. (Industry term is "Phase I ESA consultant"; the underscore convention is enum-friendly.)
- **`onDelete` policy:** `cascade` from organizations to children (tenant cleanup); `set null` for user references on historical records (deletion doesn't destroy audit history); `restrict` for `deal_buyers.builder_id` (can't delete a builder mid-deal).
- **`documents.r2_key` and `documents.external_url` both nullable.** Per CLAUDE.md note 10, documents can be platform-stored (R2) OR linked (Dropbox). One table, app validates which is set.
- **`checklist_items.external_link_url` + `external_link_label`** added to support Dropbox folder links attached directly to checklist items per CLAUDE.md note 10.
- **No indexes in v0.** At 20-50 deals scale, Postgres handles unindexed scans fine. Add indexes in a follow-up migration once real query patterns surface — start with `org_id` on hot tables. Documented in CLAUDE.md so this isn't forgotten.
- **No Drizzle `relations()` helpers yet.** Adds value only when using the query API (`db.query.deals.findMany({ with: { buyers: true }})`); for now we'll use raw select/join. Add when query ergonomics demand it.
- **UUID PKs everywhere** with `gen_random_uuid()` defaults. Built-in to Postgres 13+, no extension needed (Neon runs PG 16+).

### Deferred / Pending
- Apply migration to real Neon DB — pending Lakebridge Neon account
- Seed script (Lakebridge org + Chris's user) — pending Neon access
- Drizzle `relations()` helpers — add as queries demand them in week 2-3
- Indexes — add in a follow-up migration if/when query patterns warrant

### Blockers
- Same as Day 3: Neon account needed before any of this hits a real DB. Schema and migration sit ready in the repo.

---

## 2026-04-30 — Day 3 prep (env wiring + Drizzle config)

### Done
- `src/lib/env.ts` — `@t3-oss/env-nextjs` schema covering DATABASE_URL, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, RESEND_API_KEY
- `.env.example` — committed; documents required env vars with placeholder values; serves as the canonical "what env vars do you need" reference
- `.env.local` — gitignored; created locally with placeholder values so dev build passes while real credentials are pending
- `drizzle.config.ts` — at repo root; reads `.env.local` via dotenv; schema in `src/db/schema/*.ts`, migrations out to `src/db/migrations/`; snake_case casing; strict mode
- `src/db/index.ts` — Drizzle client wired to `@neondatabase/serverless` HTTP driver
- npm scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`
- Verified: lint passes, build passes (Next.js picks up `.env.local`), drizzle-kit reads config and injects env successfully (errors only because no schema files exist yet — expected)

### Decisions
- **Build forward with placeholders rather than wait on accounts.** Per user direction. All Day 3-7 prep work that doesn't require live external services can happen now; swapping placeholder env values for real ones is a one-line change.
- **Env schema includes only what's needed for Days 3-7.** R2 / Sentry vars added when those features land. Avoids requiring placeholders for things we won't touch for weeks.
- **Drizzle uses `snake_case` casing across both `drizzle.config.ts` and the client.** Matches Postgres convention; Drizzle handles camelCase ↔ snake_case mapping automatically.
- **Neon HTTP driver (`drizzle-orm/neon-http`)** over WebSocket or pooled options. HTTP works in both Node and Edge runtimes, has zero connection management overhead, and is what Drizzle docs recommend for Neon.

### Deferred / Pending
- Real `DATABASE_URL` from a Neon project — pending Lakebridge Neon account
- Hello-world migration against real DB — pending above

### Blockers
- Day 3 final step (run a migration) blocked on Neon account. Day 4-5 (write schema, generate migration SQL files locally) is unblocked and can proceed without Neon access.

---

## 2026-04-30 — Day 2: Tooling layer

### Done
- Installed Drizzle ORM (`drizzle-orm`) + drizzle-kit (dev)
- Installed Postgres driver `@neondatabase/serverless`
- Installed `@clerk/nextjs` (SDK only; init/middleware deferred until Clerk account is live)
- Installed `@sentry/nextjs` package (Sentry wizard deferred until Sentry account is live)
- Installed `@t3-oss/env-nextjs` and `zod` (peer)
- Installed `resend` SDK
- Created folder structure: `src/db/schema/` and `src/db/migrations/` (with `.gitkeep`)
- Lint and build still pass clean post-install
- CLAUDE.md updated with Day 2 progress and driver/runtime decisions

### Decisions
- **Postgres driver: `@neondatabase/serverless`** over `postgres` (postgres.js) or `pg`. Drizzle has first-class Neon HTTP driver support, works in both Node and Edge runtimes, and is what Neon themselves recommend.
- **Clerk and Sentry: SDK only, defer wizards/init.** Both wizards require active accounts (Clerk org, Sentry project) which Lakebridge is still provisioning. Installing the SDK now keeps Day 2's "no configuration yet" intent intact and unblocks Day 6-7 once accounts exist.
- **No `src/lib/env.ts` placeholder yet.** Per CLAUDE.md "no configuration yet" — env file gets created Day 3 when the first env var (`DATABASE_URL`) needs to land.
- **Drizzle layout: `src/db/schema/` + `src/db/migrations/`.** Keeps everything db-related importable via `@/db/...` alias and matches the structure CLAUDE.md specifies. `drizzle.config.ts` will land at repo root in Day 3.

### Deferred / Pending
- Sentry wizard run — pending Lakebridge Sentry account
- Clerk app/org configuration — pending Lakebridge Clerk account
- Vercel deploy — pending Lakebridge Vercel account (carryover from Day 1)

### Blockers
- None active. Day 3 (Neon connect + first migration) needs Neon access — depends on Lakebridge Neon account or Sean's collaborator access being live.

---

## 2026-04-30 — Day 1: Scaffold

### Done
- Next.js 16.2.4 app scaffolded (App Router, Turbopack, TypeScript strict, Tailwind v4, ESLint 9, src/ layout)
- shadcn/ui initialized (`base-nova` preset — uses BaseUI under the hood, not Radix)
- 12 base shadcn components installed: badge, button, card, checkbox, dialog, input, label, select, sonner, table, tabs, textarea
- Prettier + `prettier-plugin-tailwindcss` configured; `format` and `format:check` npm scripts added
- `references/` folder created and populated with client design assets (prototype HTML, Excel wireframe, discovery CSV, proposal, plan, account setup checklist), with `references/README.md` distinguishing authoritative design sources from background context
- Lint and build both pass clean
- CLAUDE.md updated to reflect actual installed versions (Next 16, React 19, Tailwind v4) and Day 1 progress
- Initial commit pushed to `origin/main` — repo: https://github.com/Smatsutsuyu/brokerage-process (commit `59db6ad`)

### Decisions
- **Next.js 16 instead of Next 15** as originally specified in CLAUDE.md. Latest stable now ships as 16; using current best-practice and noted in CLAUDE.md for transparency.
- **shadcn `base-nova` preset (BaseUI-backed) over the older Radix-backed preset.** This is the modern shadcn default — no reason to opt out.
- **`Sonner` instead of `Toast`** for toast notifications. shadcn renamed/replaced the Toast primitive with Sonner; CLAUDE.md's "Toast" maps to `sonner.tsx`.
- **`form` component skipped at scaffold time.** Modern shadcn registry no longer ships a standalone form component — pattern is now react-hook-form + zod added when the first form lands. Will install in week 2.
- **Project scaffolded into repo root** (not nested under `app/` or similar). Standard Next.js layout, plays cleanest with Vercel and shadcn defaults.
- **`base-color: slate`** for shadcn theming. Neutral choice, easy to retheme to Land Advisors brand colors when the prototype is studied in week 2.
- **Default branch renamed `master` → `main`** to match GitHub convention. Done before any commits, so no migration cost.

### Deferred / Pending
- **Vercel deploy** — pending Lakebridge Vercel account creation. Once available, will be a single "import repo" click.

### Blockers
- None active. Day 2 (tooling layer: Drizzle, Clerk, Sentry, Resend SDK, env management) can begin without external input.
