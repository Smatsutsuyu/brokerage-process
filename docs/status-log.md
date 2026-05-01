# Status Log — Lakebridge Capital Deal Lifecycle Platform

Running record of work, decisions, deferrals, and blockers. Newest day at top. Source for on-demand status reports (daily, weekly, client-facing, etc.).

---

## 2026-05-01 — Contacts: Add Contact modal (existing builder)

### Done
- **"+ Add Contact" button is functional.** Clicking opens a modal that creates a new contact at an existing builder on the deal.
  - New server action `addContact` — validates required first/last name, confirms the builder is on the deal (prevents adding contacts to builders not in the deal), inserts into `contacts`, revalidates the page.
  - New client component `views/add-contact-modal.tsx` — shadcn Dialog with builder picker (existing-only for v1), first/last name (required), title/email/phone/comments (optional), inline error display, pending state during submit.
  - Builder dropdown derived client-side from existing rows — unique builders that are already on the deal.
  - Contacts notes (`contacts.notes`) now displayed in the Comments column, falling back to `deal_buyers.comments` for builders without an individual contact yet.

### Decisions
- **V1 scope: existing builders only.** Most common case (Lennar/Toll already each have 2 contacts; adding a 3rd is the typical workflow). "Add new builder" and "Add buyer not yet on this deal" are deliberately deferred.
- **Comments column shows `contacts.notes` first, `deal_buyers.comments` as fallback.** Per-contact notes are more granular and fit better with the multi-contact model. The deal-buyer-level comment field stays in the schema for cases where the buyer isn't yet a person.
- **Server-side validation that the builder is on the deal.** Forged builder IDs from the client can't slip through and add contacts to arbitrary deals.
- **Form reset on close, not on open.** Setting state in `useEffect` is generally discouraged in React 19, but form-reset on dialog close is a legitimate use of effects (not derived state). Bracketed with eslint-disable for the file.
- **Tier and Lead intentionally NOT in this modal.** Tier change is already inline in the table (TierBadge dropdown); separate modal field would create two ways to do the same thing. Lead reassignment is its own concern.

### Notes for next steps
- Add Builder modal (or extend Add Contact with a "+ create new builder" path)
- Edit / Delete contact (icons in the actions column placeholder)
- Lead user reassignment
- Q&A workflow (next tab)
- Issues tracker (after Q&A)

### Blockers
- None.

---

## 2026-05-01 — Contacts: prototype columns + sortable headers + called/OM toggles

### Done
- **Contacts table now matches the prototype's 13-column layout**: `# / Interest / Builder / Contact / Title / Email / Phone / Type / Lead / Called / OM / Comments / (actions)`. Previously had 7 columns with Interest at the end.
- **Interest dropdown labels restored to prototype's descriptive form**: "Green — Interested" / "Yellow — Evaluating" / "Red — Immediate Pass" / "Not Selected on Deal". In-row badges keep the short label so the cell stays compact.
- **Sortable column headers across all 11 sortable columns** (everything except # and the actions placeholder).
  - Click a header → first click sets ascending, second flips to descending. Different column resets to ascending.
  - Active column shows ↑/↓ icon; idle columns show a muted ↕ to signal sortability.
  - Default sort: Builder asc.
  - Sort + filter compose — `#` reflects position in the visible (filtered + sorted) set.
  - Comparators: text uses `localeCompare`, nulls/empty always sort last regardless of direction; tiers use a fixed rank (green/yellow/red/not_selected); booleans rank false-then-true.
- **Called and OM Sent are now interactive checkboxes**, not just display.
  - New server actions: `setBuyerCalled` and `setBuyerOmSent` — flip the timestamp to `now()` or `null`.
  - New client component: `views/buyer-checkbox.tsx` — same `useTransition` + spinner pattern as `ChecklistCheckbox`.

### Decisions
- **Two-state sort cycle (asc → desc → asc)**, not three-state (asc → desc → no-sort). Three-state is hard to remember; two-state is predictable. Resetting to a "no sort" doesn't add value when there's always a sensible default (Builder asc).
- **Checkboxes write a timestamp, not a boolean.** Schema stores `calledAt` / `omSentAt` as nullable timestamps — gives us "when did this happen" for free, surfaceable in tooltips/reports later. Booleans for the UI are derived (`!!omSentAt`).
- **Comments column uses `line-clamp-2`** (truncates after 2 lines, max-width xs). Matches the prototype's intent — comments shouldn't blow up the row height.
- **Empty actions column is a `<th></th>` placeholder** to reserve the slot. Edit/delete buttons land in the next slice.

### Notes for next steps
- Add Contact modal (pick existing builder OR create new builder + first contact)
- Edit / Delete contact (icons in the actions column)
- Lead user reassignment (currently shows seeded value only)
- Comments inline edit (click to edit?)

### Blockers
- None.

---

## 2026-05-01 — Contacts: multi-contact builders + inline tier change

### Done
- **Seed updated to demonstrate multiple contacts per builder.** Lennar now has 2 contacts (Mark Sustana + Jennifer Lee), Toll Brothers has 2 (Sarah Pham + Michael Chen), Shea Homes stays at 1 (David Kim) so both cases are visible. Schema and query already supported this — only the seed needed adjustment.
- **Inline tier change is live.** Click any tier badge in the Contacts table → dropdown menu appears with all 4 tiers (Green / Yellow / Red / Not Selected). Pick a tier → server action updates `deal_buyers.tier` → `revalidatePath` refreshes the page.
- New: `src/app/(app)/deals/[id]/views/tier-badge.tsx` — client component using shadcn `DropdownMenu` (just installed); shows current tier with colored dot + chevron, spinner during the round-trip
- New action `updateBuyerTier` in `actions.ts` — scoped by `org_id` for tenant isolation, same pattern as `toggleChecklistItem`
- Installed `src/components/ui/dropdown-menu.tsx` via shadcn add

### Decisions
- **Dropdown picker over click-to-cycle.** Cycling (green → yellow → red → not_selected → green) is annoying when going from "red" back to "green" — needs 2 clicks. Direct picker is one click + one selection regardless of source/target.
- **Tier filter chips and the badge use the same `TIER_META` shape but in two files.** Slight duplication (chip vs badge styling). Acceptable — extracting a shared util is over-DRY at this scale.
- **`onSelect` instead of `onClick`** on DropdownMenuItem — radix/baseui menu primitives use onSelect for keyboard + mouse uniformly.

### Notes for next steps
- Add Contact modal (pick existing builder OR create new builder + first contact)
- Edit / Delete contact (less urgent than add)
- "OM Sent" / "Called" status flags surfaced in the table (schema already has them)
- Lead user reassignment (currently shows seeded value only)

### Blockers
- None.

---

## 2026-05-01 — Contacts/Buyers tab (read-only) + DB pool fix

### Done
- **Contacts tab is functional.** Replaced the "Coming soon" placeholder with a real read-only view of buyers on each deal.
  - `src/app/(app)/deals/[id]/views/contacts-view.tsx` — server component, fetches one row per (builder × contact) joining `deal_buyers → builders → contacts → users` (lead). Uses LEFT JOIN on contacts so builders without named contacts still appear.
  - `src/app/(app)/deals/[id]/views/contacts-table.tsx` — client component, renders the prototype-style table (Builder / Contact / Title / Email / Phone / Lead / Tier) with tier-colored left border on each row.
  - Filter chips above the table: All / Green / Yellow / Red / Not Selected — each with a live count, client-side filtering via `useState`.
  - "+ Add Contact" button placeholder (disabled with tooltip) — CRUD comes next slice.
- **Postgres connection pool fix.** Build was hitting "too many clients already" because each Next.js build worker spun up a fresh `postgres()` client with the default 10-connection pool. Two changes:
  - `src/db/index.ts` now wraps the `postgres()` client in a `globalThis` singleton with `max: 5` per instance, so dev hot-reload and build workers reuse the same pool.
  - `src/app/(app)/page.tsx` exports `dynamic = "force-dynamic"` (the home page reads org-scoped data; never appropriate to prerender statically).

### Decisions
- **Read-only first, CRUD in a follow-up slice.** Establishes the rendering pattern, lets you visually confirm the layout matches Chris's prototype, then we add modals for create/edit/delete.
- **One row per `(builder × contact)`**, not one per builder. Matches the prototype and reflects the real workflow ("which person at Lennar do I email?"). A builder with three contacts gets three rows, all sharing the same tier badge.
- **Tier badges are display-only for now.** Click-to-cycle tier change comes with the CRUD slice.
- **Connection-pool singleton via `globalThis`** — standard Next.js pattern for any DB client. Dev hot-reload would otherwise leak a new pool on every file change. Belt-and-suspenders with the `max: 5` cap.

### Notes for next steps
- Add Contact / Edit / Delete modals — server actions + client components, same pattern as the checklist toggle
- Tier change inline (click badge → cycle, or dropdown)
- "Lead" column should let you assign a team member (currently shows the seeded value only)
- "OM Sent" / "Called" status flags from the schema are loaded but not yet surfaced in the table

### Blockers
- None.

---

## 2026-05-01 — Feedback widget polish (Chris review pass 1)

### Done
- **Affordance no longer overlaps section corner content.** Default `<FeedbackZone>` position changed from `top-2 right-2` (inside corner) to `-top-2 -right-2` (just outside corner). Was colliding with the chevron on the checklist's first phase header.
- **`align="inside"` escape hatch** added to FeedbackZone — for zones that abut the viewport edge (e.g. priority ribbon at top of screen) where the outside-corner position would clip. Applied to the priority-ribbon zone.
- **Severity dropdown labels shortened** to single words (Nit / Suggestion / Bug / Blocker). The dash-separated explainer text was overflowing the dropdown trigger. Schema enum values unchanged — historical data still consistent.
- **Email field removed from feedback modal.** `getCurrentUser()` already populates `userEmail` on the server side from the user record (currently the seeded Chris user, the auth-context user once Clerk wires). Single source of truth, less for Chris to type.

---

## 2026-05-01 — In-app feedback widget for Chris's review

### Done
- New `feedback_items` Postgres table (org_id, user_id, user_email, section, page_path, commit_sha, severity enum, comment, status enum, timestamps)
- Two new enums: `feedback_severity` (nit/suggestion/bug/blocker), `feedback_status` (new/reviewed/actioned/wontfix)
- Migration `0001_dizzy_wind_dancer.sql` generated and applied
- Build-time commit SHA capture in `next.config.ts` — pulls `VERCEL_GIT_COMMIT_SHA` first, else `git rev-parse HEAD`, exposed as `NEXT_PUBLIC_COMMIT_SHA`
- Env additions: `NEXT_PUBLIC_FEEDBACK_ENABLED` (boolean, default true), `NEXT_PUBLIC_COMMIT_SHA` (string, default "unknown")
- `getCurrentUser()` placeholder helper alongside `getCurrentOrg()` — both return first row from DB until Clerk wires real auth context
- Feedback module under `src/components/feedback/`:
  - `actions.ts` — `submitFeedback` server action with input validation (5000 char cap, trim, slice page/section)
  - `feedback-context.tsx` — React context for sharing modal open state + active section
  - `feedback-modal.tsx` — shadcn Dialog form, captures section/page/commit/severity/comment/email, success state with auto-close
  - `feedback-button.tsx` — floating bottom-right button for general feedback
  - `feedback-zone.tsx` — wrapper component, hover reveals corner 💬 icon for section-specific feedback
  - `feedback-shell.tsx` — server component, env-gated; mounts provider/button/modal when enabled, transparently passes children through when disabled
- Wired `<FeedbackShell>` into `(app)/layout.tsx`
- Sprinkled `<FeedbackZone>` around 9 sections: priority-ribbon, sidebar (×2 — home + deal page), home-empty-state, deal-header, deal-checklist, deal-contacts, deal-qa, deal-issues, deal-consultants
- Report script `src/scripts/feedback-report.ts` with `npm run feedback:report` — markdown output grouped by section, severity-sorted within section, supports `--status=new|reviewed|actioned|wontfix|open|all` and `--out=<path>`
- Verified end-to-end: floating button + 4 zones present in homepage HTML, 4 zones present in deal page HTML; submitted 3 test rows via SQL, report rendered them grouped/sorted correctly; lint and build pass clean
- Docs updated: `docs/local-development.md` has full feedback section (how it works, reading reports, marking reviewed, disabling for prod, full removal steps); CLAUDE.md Quick Start references it

### Decisions
- **Section-level granularity, not component-level.** ~10 zones across the platform, not hundreds. Per the design discussion, Chris cares about workflow areas, not React components.
- **Env-gated, not removed.** `NEXT_PUBLIC_FEEDBACK_ENABLED=false` flips the whole module to a no-op for production. Removal procedure is documented but unnecessary if env flag is sufficient.
- **Self-hosted in Postgres**, not piped to Linear/Slack/Sentry. Self-contained, no external accounts, easy to remove. If feedback volume grows past manual triage, can layer integrations later.
- **No screenshots in v1.** `getDisplayMedia()` permissions are a UX hassle. Page URL + section name + commit SHA gives me enough to find the spot. Add later if Chris's feedback is hard to interpret.
- **Severity over priority.** "Nit / Suggestion / Bug / Blocker" maps better to UX feedback than "Low / Medium / High."
- **`useFeedback` returns a no-op context outside `FeedbackContextProvider`** so `FeedbackZone` can render safely when feedback is disabled without throwing.
- **Server action input is validated and clamped** (trim, length cap, slice on bounded string fields). Belt-and-suspenders against malformed payloads.

### Notes for next steps
- Admin UI for marking items reviewed/actioned is deferred — for now use SQL via `psql`. Worth building if/when feedback volume justifies it.
- Once Clerk wires real users, the `userEmail` field becomes optional cleanup (auth context provides it).

### Blockers
- None.

---

## 2026-05-01 — Week 2 start: checklist interactivity + full 4-phase seed

### Done
- **Server actions pattern established.** `src/app/(app)/deals/[id]/actions.ts` with `toggleChecklistItem`, scoped by `org_id` so a forged item ID can't reach across tenants. Uses `revalidatePath` to refresh the page after a write.
- **Interactive checkbox** (`views/checklist-checkbox.tsx`) — client component with `useTransition` for pending state, swaps to a spinner during the round-trip, optimistic-feeling latency.
- **Seed expanded to all four phases** — previously only Phase 1 was seeded. Now all 4 phases (Phase 1 going to market, Phase 2 marketing process, Phase 3 ownership summary of offers, Phase 4 deal management) populated per CLAUDE.md.
- **Phase 1 keeps the 5 hierarchical categories** Chris's CLAUDE.md sketches (Listing & Buyer Setup, Third Party Marketing Reports, Valuation, Marketing Documents, Underwriting & OM). Phases 2-4 use a single "Items" bucket since CLAUDE.md doesn't break those down further.
- Dev server verified end-to-end: deal page returns 200, all four phase headers render (with descriptive subtitles e.g. "Phase 1 — Going to Market"), Phase 1's 5 categories all render with their items, completed items styled correctly, no errors in Next.js log.

### Decisions
- **Hierarchical UI kept** (Phase → Category → Items). Briefly considered flattening to match the prototype more literally, but user clarified the hierarchical design is fine — original CLAUDE.md decision stands.
- **Server actions over API routes** for mutations. Idiomatic for App Router; one-file colocated with the page; type-safe; auto-revalidation via `revalidatePath`.
- **`useTransition` for pending state** rather than `useOptimistic`. Toggle is fast and simple; optimistic update would complicate rollback handling for negligible UX gain at our scale.
- **Phase descriptive labels in the UI** ("Phase 1 — Going to Market") instead of bare "Phase 1". Costs nothing, makes the workflow legible to a new user. Sourced from CLAUDE.md's "Business Domain" section.
- **`assertItemOnDeal` helper** in actions.ts — kept around for any future action that takes an itemId and needs to confirm cross-deal isolation.

### Notes for next steps
- Checklist dependency enforcement (per CLAUDE.md note 15: "block items until prerequisites are checked") not yet implemented. Schema supports it via `checklist_item_dependencies`; UI work + seed examples needed.
- Other tabs (Contacts, Q&A, Issues, Consultants) still placeholder. Same server-actions pattern will apply.
- Deal create/edit not yet built (sidebar's "+ New Deal" button is disabled with a tooltip).

### Blockers
- None. Real Clerk keys would unblock auth context (currently `getCurrentOrg` returns first org as a placeholder), but unblocking is not blocking.

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
