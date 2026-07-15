# Build Progress, Lakebridge Deal Lifecycle Platform

Living record of what's shipped on the Lakebridge Capital / Land Advisors brokerage platform across the first six weeks of the engagement. The platform is a workflow + document automation tool for residential land brokerage: it tracks a four-phase deal lifecycle, manages buyer contacts, generates Land Advisors-branded PDFs, and sends templated emails through Resend. No AI features (that work is deferred to a separate engagement).

The engagement runs roughly seven weeks across three phases. Phase 1 (Foundation) closed 2026-05-01. Phase 2 (document + email generation) kicked off 2026-05-06 and is the work most of the second half of the timeline covers. This file complements [`docs/status-log.md`](status-log.md), which has the day-by-day prose; treat this as the synthesized version.

Commit references use the short SHA; dates are ISO format. Full commit history with bodies via `git log --no-merges`.

## Phase 1, Foundation (2026-04-30 to 2026-05-01)

Goal: a hosted multi-user version of Chris's prototype, with hierarchical checklist, real persistence, and team access. Implemented in a tight burst across two calendar days, then deployed to Vercel.

**Scaffold and tooling** ([2026-04-30 status log entries](status-log.md), commits up to `a06236e`). Next 16 with the App Router and Turbopack, React 19, Tailwind v4, shadcn/ui (`base-nova` preset, which uses BaseUI under the hood). Drizzle ORM + drizzle-kit, `@neondatabase/serverless` driver, Resend SDK, `@t3-oss/env-nextjs` for env schemas. Local development runs Postgres in Docker. Twelve shadcn components installed; Form skipped since the modern registry no longer ships it.

**Core schema** (`src/db/schema/`, migration `0000_flawless_masked_marvel.sql`). Fourteen tables covering organizations, users, deals, builders + contacts (colocated), `deal_buyers` join with per-deal tier, hierarchical checklist (categories + items + dependencies), Q&A items, issues, consultants, documents, and audit log. UUID primary keys via `gen_random_uuid()`, `org_id` cascade on every multi-tenant table, snake_case via Drizzle's casing config. Indexes deliberately omitted; at 20-50 deals scale, Postgres scans are fine.

**App shell + deal pages** (`a06236e`). Sidebar with deal list and progress bars, priority ribbon, deal detail with five tabs (Checklist, Contacts, Q&A, Issues, Consultants). Land Advisors branding throughout. Brand CSS variables wired into Tailwind v4.

**Functional Phase 1 work** (commits `9552f6d` through `f258f8e`, all 2026-05-01). Interactive hierarchical checklist with collapsible phases that auto-collapse when complete; full Contacts CRUD with 13-column prototype layout, sortable headers, inline tier and lead picker, Called / OM Sent toggles writing timestamps; Q&A workflow with locked-by-default approval and approve-all; Issues tracker with status-colored cards and assignee picker; Consultants tab with 11 role cards (the original 9 plus Architect and PSA Attorney per CLAUDE.md); deal CRUD from the sidebar; profile page; owner-gated `/admin/members` page.

**Phase 1 polish** (commits `3e585ac`, `19a6e8a`). Four parallel Contacts UX prototypes (Cards / Pane / Grouped / Compact) added as separate tabs for client review. Phase 2 placeholder buttons throughout the deal page using a new `<PlannedAction>` component that fires Sonner toasts describing the future feature, giving Chris a clickable design surface before any of it was built. A "sneaky BaseUI bug" sweep replaced `onSelect` with `onClick` across six dropdown menus, since BaseUI's `Menu.Item` (unlike Radix) doesn't fire `onSelect`.

**In-app feedback widget** (`9552f6d`). Floating button + per-section bubble icons writing to a `feedback_items` Postgres table, with `npm run feedback:report` for triage. Captures commit SHA so reports correlate against deployed code. Env-gated via `NEXT_PUBLIC_FEEDBACK_ENABLED`.

## Vendor swaps (early Phase 1)

Three vendor decisions made along the way reduced Lakebridge's eventual handoff burden:

- **Clerk to Better Auth** (`ba6a29a`, 2026-05-01). Better Auth self-hosted on our Postgres with the Drizzle adapter. New `auth_*` tables to avoid colliding with our existing `users` table. Email/password only, 7-day sessions with sliding refresh, OAuth-ready. Invite-only with owner-issued initial passwords (no `/sign-up` UI). One follow-up tracked: harden the `/api/auth/sign-up/email` endpoint before public production launch since Better Auth's `disableSignUp: true` blocks our own server-side seed/invite calls.
- **Sentry dropped** (same commit). Vercel function logs are sufficient for an internal tool at this scale. Revisit if errors become hard to triage.
- **Cloudflare R2 to Vercel Blob** (`bf0c530`, 2026-05-05). Same dashboard, same billing, signed-URL browser uploads. ~$0.17/mo at projected peak. One fewer vendor account at handoff.

Combined with sourcing Neon through the Vercel marketplace integration, Lakebridge's vendor inventory is now Vercel + Resend + (Anthropic, deferred).

## Production deploy (2026-05-01 to 2026-05-04)

First Vercel deploy attempt surfaced a migration-drift bug (`4e742ec`): the schema sync from the Clerk-to-Better-Auth swap was done via `db:push` and never captured in a migration, so production builds applied an obsolete schema. Resolution: collapsed the two old migrations into a single fresh `0000` reflecting the actual current schema, then provisioned production cleanly. The lesson is now memory: `db:push` is off-limits for any environment that runs `db:migrate`.

Post-deploy polish (`3ea907b`, 2026-05-04): Vercel functions locked to `pdx1` to colocate with Neon's `us-west-2`, cutting cross-region query RTT from ~70ms to ~5ms. The deal page's seven independent queries batched into a single `Promise.all`. `getCurrentUser` and `getCurrentOrg` wrapped in React's `cache()` for per-request deduplication. Cold hit ~1.1s (function spin + Neon wake), warm hit ~290ms.

Real bug fixed in the same window (`9b796cc`): `createDeal` was only inserting the deal row, leaving newly created deals with empty checklists. The canonical 4-phase / 11-category / ~37-item template extracted into `src/db/checklist-template.ts` as a shared source for both seed and createDeal.

**Auto-migrate on deploy** (`788674d`). Added a `vercel-build` script (`drizzle-kit migrate && next build`) so every deploy applies pending migrations. Build fails if a migration fails, no half-applied state. Preview deploys get their own Neon branch DBs.

## Standalone directories + Excel import (2026-05-05)

Refactor in response to Chris's feedback that contacts should live independently of any specific builder or deal. Three commits (`46ae831`, `ac63477`, `abb68e3`):

- `contacts.builder_id` made nullable, FK changed to `ON DELETE set null` so deleting a builder orphans rather than destroys its contacts. New `geography` column.
- New `/contacts` top-level route with table view, search, filter, builder color chips (deterministic via UUID hash), sortable columns.
- New `/builders` top-level route with the same treatment, including a side-panel expand showing contacts at the builder and deals it's on. Delete blocked when builder is attached to any deal.
- Excel importer with fuzzy header matching (case-insensitive, strip non-alphanumeric), preview screen with per-row validation, auto-create unmatched builders, email-based dedupe, sheet picker, header-row autodetection, forward-fill for group-style files where a builder name spans N contacts (`2271aea`).

Phone normalization swept across all write and display sites (`src/lib/phone.ts`).

## Phase 2 begins, document upload (2026-05-06)

First Phase 2 deliverable, commits `c66b3c8` + `ccd4b82`:

- Schema: `documents.checklist_item_id` added so a doc attaches to the item it satisfies. Default status flipped from `draft` to `final`.
- `src/lib/documents.ts`: server-only helpers for authz, auto-versioning per (deal, item) pair, and stream-through-server downloads from Vercel Blob's **private** store.
- Client-driven upload completion (not Vercel's `onUploadCompleted` webhook) so dev and prod use the same path. Security comes from server verifying the pathname via `head()` against our store before writing the row.
- Inline upload UI per checklist row, not a modal. Replace + delete with auto-versioning at the data layer (no version-history UI yet, deferred).
- PDF inline render via `Content-Disposition: inline`. Excel/image inline preview deferred.

Paste-a-URL link affordance on every item (`d6c706a`) for the Dropbox-link integration Chris asked for. Inline checklist notes (`fbd8baf`) with the hidden-by-default toggle (`2271aea`).

## Phase 2 escalation, Resend pipeline + threaded feedback + Marketing Report (2026-05-11 to 2026-05-12)

Several days of compounding work that turned the platform from "tracked workflow" into "platform that actually drafts and sends things":

- **Resend pipeline wired** (`4729698`). `src/lib/email/` with a Resend SDK wrapper that no-ops gracefully when `RESEND_API_KEY` is unset. React Email templates with a shared Land Advisors-branded `EmailLayout`. Owner-only `isDeveloper` opt-in flag controls who gets notification email (recipients managed in-app, not env). Test-send button on `/admin/feedback`. Activation gated on `mail.lakebridgecap.com` DNS verification, see "Known follow-ups."
- **Threaded feedback comments** (`328e886`). Replaces the single-field response model with a full comment thread. Migration `0008` backfills existing `feedback_items.response` values into the first comment per item. New `/feedback` page for submitters to follow their own filed items.
- **Marketing Report PDF + per-deal banners + per-builder interest comments** (`e080ff1`). React-PDF route generates a per-deal report grouped/sorted by tier. Per-deal hero banner uploaded to Vercel Blob (migration `0012`), streamed through `/api/deals/[id]/banner`. Fallback navy band with deal name when no banner is set.
- **Explicit `deal_contacts` model** (`9116f45`, migration `0011`). Replaces the builder-implied contact model. Per Chris's feedback: adding one Lennar contact shouldn't drag in the other four. Bulk multi-select add (`639d569`). Per-contact `receives_communication` opt-out (`2fa6814`, migration `0013`).
- **OM blast composer** (`2fa6814`, `9db0ea5`, `1066f92`, `fcefbc4`). Preview modal with tier multi-select, deal-scoped lead filter, attachment picker (every file + link on the OM checklist row), per-builder CC picker persisted via `deal_buyers.cc_user_ids` (migration `0016`), From-address picker (Chris's `landadvisors.com` hardcoded above the divider plus the signed-in user). Hover-time amber dashed connector from the blast button back to the OM source row (validates the cross-section data-dependency pattern Sean memo'd). Real send still mocked pending DNS.
- **Multi-file + multi-link checklist attachments** (`5578510`, `b011580`, migrations `0014` + `0015`). Items can hold many files and many links, first 3 chips inline + "+N more" overflow.
- **Three builder classifications** (`726c5a9`, migration `0010`). Added `developer` alongside Private/Public for land developers (entitle and sell land vs. build on it).
- **Feedback file attachments** (`af2a226`, migration `0014`). PDFs, mockups, screenshots attached at submission, downloadable from admin.

## Phase 1-4 checklist reconciliation + Teams tab + more PDFs (2026-05-13)

Major reconciliation pass against Chris's `Marketing Process Checklist.xlsx` v2 (commits `dcc1a38`, `3412695`, `d33a5d1`, `ab4bd40`, `e846251`, `c9cc066`, `229765d`):

- **Reconciliation framework** (`dcc1a38`, `3412695`). New `src/scripts/reconcile-checklists.ts` walks every deal and ensures the current `CHECKLIST_TEMPLATE` is reflected. Initially add-only; later upgraded to handle reorders, mid-list inserts, and (via the sibling `apply-renames` script) renames, deletes, moves, and category merges. All operations idempotent. Wired into `vercel-build` between `drizzle-kit migrate` and `next build` so every deploy auto-reconciles.
- **Phases 1-4 reconciled** to match Excel v2 verbatim: category renames, item renames, item deletes (with cascade impact reporting), new items inserted at correct positions, all preserving existing completion state and attachments.
- **Teams tab** (`e846251`, migration `0018`). New tab with three sub-teams (Owner / Broker / Buyer). Polymorphic identity: rows link to `users` (Broker), `contacts` (Buyer), or stay free-text (Owner). Multi-add staging modal. Bell-icon include-in-emails toggle.
- **Tracked-date affordance** for milestone items (`38b5e6a`, migration `0017`). Phase 4 items like CTC Due Date, Investment Committee, Feasibility, Closing render a date chip.
- **Cross-tab nav links** on checklist items (`e846251`). Template flags items with `linksTo: TabKey` so "Issues Tracking Sheet" jumps to the Issues tab.
- **Issues PDF + Q&A File PDF** (`e846251`, `229765d`). Both match the Marketing Report's LAO-branded family. Phase 2/3 buyer sends generalized via a single `BlastModal` component (`229765d`). `DealTeamSendButton` for owner+broker sends from Phase 3/4.
- **11 email templates** in `src/lib/email-templates.ts` covering the full Excel set.

## Polish + reliability (2026-05-14 to 2026-05-15)

- Per-builder Confi-signed checkbox tracking (`292e69e`, on the cards layout).
- PDF layout pass: marketing-report column alignment, Open Sans + continuous tier bars, no mid-word hyphenation, single-page layout with combined fixed header for true repeat, preview in browser instead of forcing download, cache-bust on each click (`b14c41a`, `c9cc066`, `cbd4fae`, `4832877`, `32c7ad4`, `6fa9fd8`).
- Builder dedupe: unique index on `(org_id, lower(trim(name)))` plus dedupe scripts run against prod (`6495d54`).
- Feedback notifications model overhaul (`6dc43b0`, migration `0025`). Four owner opt-in channels replacing the developer-mode flag. All defaults flipped OFF (`c33a9a7`, migration `0026`) so owners opt in.
- Per-user deal reordering with up/down hover controls (`dbff96d`, migration `0027`).
- Real LAO logo image swap in for the sidebar wordmark (`4a245bc`).
- Layout fix using `h-dvh` so the sidebar isn't hidden by the Android nav bar on tablet (`345ec27`).
- Member-remove flow: hard delete with cascade, last-owner guardrail, fix for inviting a member signing the owner out (`12685c5`).
- Auto-clean orphan `deal_buyers` rows on builder delete (`1434e4d`, `85e7747`).

## Owner-triggered password reset + first-login set-password (2026-07-03)

- **New `users.must_set_password` column** (migration `0030_cooing_shotgun.sql`). Default false; flipped true by an owner reset, cleared by the user's own `setOwnPassword`. `getCurrentUser` returns it as part of the shape.
- **`(app)/layout.tsx` async gate** — layout is now async and calls `getCurrentUser`; if `mustSetPassword` is set, redirects to `/set-password` before rendering children. Extra DB round-trip is free thanks to `React.cache()`.
- **`/set-password` route (new).** Server page + client form + `setOwnPassword` server action. Server page redirects to `/sign-in` when unauthenticated and to `/` when the flag is already cleared. Action hashes via `hashPassword` from `better-auth/crypto`, writes to `auth_account.password` for `providerId = "credential"`, clears the flag, `revalidatePath("/", "layout")`.
- **`resetMemberPassword({ userId, newPassword })` server action** in `admin/actions.ts`. Owner-gated, refuses self-reset. Wraps the credential-row password update, the `must_set_password` flip, and a full `auth_session` sweep for the target in one transaction — a stale browser tab can't outlast a reset.
- **Reset PW button on every row** in `/admin/members` next to Disable / Remove. Opens `ResetPasswordModal`: same adjective-noun-### generator as invite, Regen button, success view with the temp password on screen + a Copy button so the owner can share it out-of-band. Modal notes that active sessions were signed out and the user will be prompted to pick their own password on next sign-in.

## B&F invite hard-gated on row date (2026-06-17)

- **B&F due date now lives on the "Send out B&F" row.** Added `dateField: true` to the Phase 3 item in `CHECKLIST_TEMPLATE` so the row gets the standard milestone-date affordance (date chip + native picker, same as Offering Date / LOI Signed / Closing Date). No migration: `isItemDateField` is a runtime template lookup, so existing deals pick up the chip on next render.
- **New `getBnfDueDate({ dealId })` server action** reads the row's `trackedDate`. `getOmBlastTemplateContext` now also includes `bnfDueDate` in the vars dictionary (formatted via the existing `formatOfferingDate` local-time helper), pulled from the same checklist-items query that already loads Offering Date so there's no extra DB round-trip.
- **`BuyerBlastButton.requireBnfDate` prop** — sister of `requireOfferingDate`. Hard gate: pre-flight refuses to open the composer if the B&F date isn't set, surfacing the inline red bubble with "Set the B&F due date on this row first, then send."
- **Phase 3 B&F row** swapped from the disableSend skeleton (composer-opens-but-Send-greyed) to a real `requireBnfDate` hard gate. The final Send button is enabled once the date is set, because at that point `{{bnfDueDate}}` resolves cleanly and the user just needs to fill the Close-of-Escrow and Closing-Conditions sections inline at compose time.
- **Broker Team default-CC on OM blast.** Generalized `getOwnerTeamCcOptions` to `getDealTeamCcOptions({ dealId, team })` so the same query/format pipeline serves both owner-team and broker-team lookups; sentinel IDs gain a `${team}:` prefix for routing through the persistence filter. Picker `CcGroup` union and `GROUP_LABEL` map extended with `"broker"` → "Broker Team". `BlastModal` loads both teams in parallel and renders three CC sections (Owner Team → Broker Team → Org Members). New `defaultCcTeams?: Array<"owner" | "broker">` prop on `BlastModal` and `BuyerBlastButton`; when set, the modal pre-populates every builder's CC selection with the corresponding team's sentinel ids so they're checked on open (still ephemeral per-send — not persisted to `deal_buyers.cc_user_ids`). `OmBlastButton` opts in with `defaultCcTeams={["broker"]}`. Persistence filter strips both `owner:` and `broker:` sentinels.

## Offering Date wiring, B&F skeleton, Send Marketing Report on Contacts tab (2026-05-29)

- **Offering Date wired into the `{{dueDate}}` placeholder.** New `getOfferingDate({ dealId })` server action returns the deal's Offering Date Phase 2 milestone row trackedDate (loose substring match so a rename still resolves). `getOmBlastTemplateContext` now also fetches it and exposes `dueDate` in the vars dictionary, formatted as `"Friday, May 29, 2026"` (built from local-time Date parts so the YYYY-MM-DD string doesn't get pulled back a day by UTC interpretation).
- **OM blast template** now includes "Offers on this Project are due on {{dueDate}}." between the OM intro and the close. When the Offering Date isn't set, `OmBlastButton`'s click triggers a confirmation dialog ("Send without date" / "Set date first") and swaps to a `OM_BLAST_TEMPLATE_NO_DATE` variant that drops the line entirely on confirm. Soft check rather than hard gate because the OM often goes out before the deadline is finalized.
- **1-week offers-due notice** gets a hard gate. `BuyerBlastButton` gained a `requireOfferingDate?: boolean` prop; when set, the pre-flight check refuses to open the composer if the Offering Date is empty and surfaces the existing inline red bubble pointing the user at the Phase 2 row.
- **Send Marketing Report** button (the existing two-step PDF-preview-then-email flow) added to the Contacts tab toolbars (all four prototypes) next to the existing Marketing Report PDF and Internal Report buttons. Uses `compact={false}` so it matches the other toolbar buttons' chrome.
- **B&F invite skeleton.** New `BEST_AND_FINAL_INVITATION_TEMPLATE` in email-templates.ts (Subject: "Best & Final invitation, {{dealName}}"; body matches Chris's stock prose with `{{units}}`, `{{dealName}}`, `{{bnfDueDate}}`, `{{senderName}}` placeholders). Phase 3 "Send out B&F" row matcher `isSendBnfItem` and a `BuyerBlastButton` render with `defaultTiers={["green"]}`. The trigger button is enabled and the composer fully exercisable (recipient picking, preview, body edits); only the final **Send** at the bottom of Step 2 is disabled with a tooltip naming the open items (B&F due date source + Close-of-Escrow / Closing-Conditions language). New `disableSend` + `disableSendReason` props on `BuyerBlastButton` flow through `BlastModal` to `EmailPreviewBody`'s Send-button render. Button label is "Send B&F" (not "Send B&F invite") per Chris's request.

## OM blast tracking, dev sender override, tier-tinted recipient list (2026-05-21)

- **`omSentTracking` mode on `BlastModal`.** Unified three behaviors under a single prop, opt-in by `OmBlastButton`:
  - Step 1 builder header shows an amber "OM sent MMM D" chip for builders whose `deal_buyers.om_sent_at` is set; Step 2 paginator shows the same as a banner above the active builder's preview.
  - Builders in the "previously OM-sent" set are auto-added to `excludedContactIds` on each open (once recipients load), so the default is "don't re-send." User check-overrides stick across in-session filter changes via an `autoExcludeApplied` flag.
  - After `sendBlastEmails` returns, every builder with an `ok: true` outcome is bulk-marked via new server action `markBuildersOmSent(dealId, builderIds)` (single UPDATE, not N round-trips). `revalidatePath` refreshes the contacts tab toggle.
- **`previewBlastRecipients` query + `BlastPreviewRow` type** gained `omSentAt: Date | null` from `deal_buyers`. `BlastModal`'s grouped builder map carries it (along with the existing `tier`) so the warning chip and tier color both come from the same memo.
- **OM blast attachment pre-flight.** `OmBlastButton.onClick` now mirrors the `BuyerBlastButton` validation: resolves the OM item id (eagerly, vs the existing lazy-on-open lookup), fetches attachments, and refuses to open the composer if no `kind: "file"` is present. Inline red bubble anchored under the button (`useInlineError`); two distinct messages for "no OM row on this deal" vs "no file attached." Network errors still fall back to sonner.
- **Tier-tinted recipient list.** Each builder group's `<li>` in Step 1 gets a `bg-{green|yellow|red|gray}-50` + matching border based on the builder's tier, so a multi-tier blast preview reads its groups at a glance. Hover state on individual contact rows stays `bg-white` to pop against the tint. `TIER_META` gained a `rowBg` field.
- **`DEV_BLAST_SENDER_EMAIL` env var** (added to `src/lib/env.ts`). When set, swaps just the email on the composer's `ACTIVE_BLAST_SENDER` in `actions.ts`; display name + first name stay "Chris Shiota." Lets a local dev route blast sends through a verified Resend domain (e.g. `noreply@portal.lakebridgecap.com` on the portal account) without touching production behavior. Documented in `.env.example` and `docs/operations.md`.
- **`EmailPreviewBody` gained an optional `priorSendNotes?: Record<string, string>` prop** (component-level addition for the Step 2 banner; kept generic so similar "X already happened" notes can be layered on other blasts later).

## Blast send throttle + rate-limit retry (2026-05-21)

- **Throttle.** The per-builder send loop in `src/lib/email/blast.ts` was sequential-but-unthrottled, so on a large blast (one email per builder, 20-30+ on a real OM blast) fast Resend responses could burst past the account's per-second rate limit, returning `429 rate_limit_exceeded`. Added a minimum gap between send starts (`SEND_INTERVAL_MS`, default 250ms ≈ 4/sec). Natural send latency usually covers most of the gap, so the added sleep is small.
- **Env override.** `SEND_INTERVAL_MS` shipped as a code constant (`DEFAULT_SEND_INTERVAL_MS = 250`) but overridable via the `SEND_INTERVAL_MS` env var (`src/lib/env.ts`, `z.coerce.number().int().nonnegative().optional()`) so the rate can be tuned without a deploy; `0` disables throttling.
- **429 retry.** `sendWithRateLimitRetry` retries only on rate-limit rejections (detected via the `[rate-limited]` prefix `sendEmail` now adds to the error string), up to 3 times with linear backoff (1s/2s/3s). Other failures return immediately.
- **Diagnostics.** `sendEmail` now logs `name` + `statusCode` on API errors and prefixes rate-limit errors with `[rate-limited]`. The blast loop logs `[blast:send]` per send (index, elapsed, gap-since-previous) so the effective req/sec is visible; `[blast:rate-limit-retry]` logs any backoff.
- **Local repro harness.** New `src/db/seed-email-test.ts` + `npm run db:seed:email-test` — additive (no wipe) seed of a "RL Test — Rate Limit" deal with `BUILDER_COUNT` (default 6) builders, each contact at `seanesparza+rlN@gmail.com` (one inbox via Gmail subaddressing), green tier, on-deal. Documented in `docs/local-development.md`.

## Favicon, deal menu, sidebar drag-and-drop, attachment guards (2026-05-21)

- **LAO favicon** replaces the default Next.js mark. Cropped the triangle icon from `public/lao-logo.jpg`, knocked out the white background to transparent, padded ~22% so it doesn't touch tab edges. Emits `src/app/icon.png` (32) and `src/app/apple-icon.png` (180) via the App Router file convention; old `favicon.ico` removed.
- **Deal options menu** (top-right of deal header) replaced the muted 3-dots icon with a labeled "Edit" button: pencil + label + chevron, with a visible border at rest. Reads as a clickable affordance instead of a hint.
- **Sidebar deal list rebuilt on `@dnd-kit/sortable`.** Each row carries a thin always-present grip-handle gutter on the left (no more overlap with the phase chip). Title gets the full first row; phase chip moved to the end of row 2 next to the progress bar so long names no longer truncate. `min-w-0` on the Link container so flex children actually truncate. New `reorderDeals(orderedIds[])` server action persists the full ordering in one round-trip; old `moveDealUp` / `moveDealDown` server actions remain in `reorder-actions.ts` (no UI callers).
- **`InlineErrorBubble` + `useInlineError` hook** (new, `src/components/inline-error-bubble.tsx`) — reusable rejection-bubble pattern for row-button click validation. Centered horizontally on the trigger, sized to content's preferred single-line width (`w-max` + 320px cap so a narrow parent can't squeeze the bubble into one-word-per-line wrapping), and viewport-clamped via a pre-paint `useLayoutEffect` measurement so it never spills off the screen edge when the trigger is near a viewport boundary. High-contrast red-on-red, auto-dismissing after 6s, click-to-dismiss. Standard pattern for "Send a file and/or link in an email" row buttons; documented in the file's header comment.
- **Phase 2 row attachment guards.**
  - **Send Market Study** (`requireAttachment="file"`, noun "Market Study") — rejects if no uploaded file on the row.
  - **Send DD Folder** for the new "Share Marketing Due Diligence Folder" row (`requireAttachment="any"`, noun "DD folder link or file") — accepts a file or a Dropbox / SharePoint link.
  - Both surface the inline bubble on rejection; network errors still go through sonner.
  - New `SHARE_MARKETING_DD_TEMPLATE` email body.
- **Sonner description text darkened globally** (`!text-gray-700`) so any toast that uses the description slot is readable on white instead of the default low-contrast muted gray.

## Email pipeline follow-ups (2026-05-20)

- **BCC the sender on every client-facing send.** Resend sends through its own SMTP and doesn't deposit in the sender's Outlook Sent Items, so without this Chris had no mailbox record of platform sends. `sendResolvedEmails` now adds `bcc: email.from.email` on each per-builder send, deduped when the sender is already in to/cc. `SendEmailInput` gained a `bcc` field; the feedback pipeline doesn't use it.
- **`EMAIL_FROM` cutover** from `feedback@landadvisors.com` to `no-reply@landadvisors.com`. Signals that replies aren't monitored and avoids needing LAO IT to provision a monitored mailbox.

## Email pipeline live cutover (2026-05-20)

DNS records for `landadvisors.com` are in. Resend consolidated to a single account (landadvisors.com domain verified); the older lakebridgecap.com Resend instance is being retired.

- **`sendEmail()` accepts per-call `from`, `cc`, `attachments`** so the same wrapper covers both pipelines. When `from` is omitted it falls back to `EMAIL_FROM`, preserving the feedback-notification behavior.
- **New `src/lib/email/blast.ts`** with `sendResolvedEmails(emails, { orgId })`. Resolves selected file attachments by org-scoped lookup in `documents`, fetches the bytes from Vercel Blob, then sends per-builder sequentially (respecting Resend's rate limit). Link-type attachments are appended to the body as a "Links:" section since most are auth-required folder URLs (Dropbox / SharePoint) that can't be fetched server-side. Partial failures recorded per builder, not aborted.
- **`sendBlastEmails` server action** in `actions.ts` — thin org-scope wrapper around `sendResolvedEmails`.
- **`BlastModal` and `DealTeamSendButton` now call the real action**, replacing the toast mocks. Composer toast reports success / partial-failure / total-failure with per-builder reasons.
- **Sender dropdown simplified to a single fixed option, `cshiota@landadvisors.com`.** The signed-in-user fallback option was dropped, users sign in with `@lakebridgecap.com` addresses which can't be used as a sender without a separate domain verification.
- **`EMAIL_FROM` cutover** to `no-reply@landadvisors.com`. Feedback notifications now send from the same verified domain as the client-facing pipeline; the `no-reply` prefix signals these are one-way (the mailbox isn't monitored — no LAO IT coordination needed to provision a real inbox).
- **Docs:** `.env.example`, `operations.md`, and `CLAUDE.md` updated to reflect the single-account / single-domain consolidation.

## DD Tracking + brand sweep + blast UX (2026-05-18)

- **Due Diligence Tracking PDF** (`8c6a0bb`) replaces the standalone Issues Report. Single combined report covering the 7 Phase 4 milestone dates, issues grouped by status (no summary stats — Chris's feedback), the Deal Team (Owner / Broker / Buyer), and the consultant roster. New route `/api/deals/[id]/dd-tracking.pdf` and a fresh `DD_TRACKING_TEMPLATE` email body. Phase 4 row renamed "Issues Tracking Sheet & Send Out before calls" → "Complete Due Diligence" via `apply-renames`. Old issues-report route + lib doc + view components deleted; loose-match in `phase-section` keeps both names recognized while deals migrate.
- **Brand sweep, Lakebridge Capital → Land Advisors Portal** (`f1b84de`). Tab titles, sign-in subtitle, root meta description, outbound-email footer, invite-member modal, and Team-list "Org user" tooltip all rebranded. Internal admin notification subjects and code comments left alone.
- **Two new consultant roles, Title and Escrow** (`5707562`, migration `0028`). Append to `consultant_role` enum, label map updated, TypeScript union extended. 11 roles → 13.
- **Email blast modal, single-window flow + per-recipient checkboxes** (`c2aa495`). Extracted `EmailPreviewBody` from `EmailPreviewModal` so it can be embedded inside another Dialog. `BlastModal` now switches `step` state between filter and preview in one Dialog (no stacked modals); recipient list in Step 1 has per-contact checkboxes (default checked) plus a builder-level select-all with indeterminate state; Step 2 footer shows Back with an arrow instead of Cancel. Standalone `EmailPreviewModal` wrapper preserved for `DealTeamSendButton`.
- **Team-add Select controlled-from-first-render fix** (`75b0a8d`). Use `null` instead of `undefined` to keep Base UI's Select controlled and quiet its warning.

## Architecture decisions made along the way

- **Auth: Clerk to Better Auth** (2026-05-01). Self-hosted on our Postgres, reduces vendor count.
- **Monitoring: Sentry dropped** (2026-05-01). Vercel function logs sufficient at this scale.
- **File storage: R2 to Vercel Blob** (2026-05-05). Native to the platform, signed-URL uploads.
- **Database: Neon via Vercel marketplace integration** (2026-05-01). Single billing relationship through Vercel, preview deploys get their own DB branch.
- **Postgres driver: switched from `neon-http` to `neon-serverless` in prod** (`17c553b`, 2026-05-11) for transaction support, needed once the bulk-add and explicit-deal-contacts flows started using transactions.
- **Email: Resend with React Email templates** (`4729698`). Lazy SDK init, no-ops without `RESEND_API_KEY` so dev boots without an account.
- **Checklist reconciliation framework**: `vercel-build` runs `drizzle-kit migrate` then `apply-renames` then `checklist:reconcile` then `next build`. All operations idempotent. Means CHECKLIST_TEMPLATE edits flow into existing deals automatically on deploy, no manual one-shots.
- **Document store: private with stream-through-server downloads** rather than public-with-unguessable-URLs. Compute cost is negligible at our scale; audit trail is full.
- **Multi-tenancy: `org_id` on every multi-tenant table** from day one. Single tenant at launch (Lakebridge), but the foundation supports isolated environments without restructuring.
- **No transactions on Neon HTTP driver** was a constraint early on; the switch to `neon-serverless` removed it for prod, and most new server actions now use transactions.

## Known follow-ups

- **Harden the open `/api/auth/sign-up/email` endpoint** before public production launch. Better Auth's `disableSignUp: true` blocks our own server-side seed/invite calls, so we need a custom server-side guard.
- **Version-history UI for documents** deferred. Old blobs remain in storage on replace; surfacing them in the UI is a small lift if Chris asks.
- **Excel/image inline preview** deferred. Browsers render PDFs natively, but `.xlsx`/`.docx` need a third-party viewer (Microsoft Office Online iframe is the likely path).
- **Audit log entries for member changes** (role / disable). Schema supports it; not yet wired.
- **The `r2_key` column name** in `documents` stores Vercel Blob URLs despite the historical name. Cosmetic rename deferred.
- **Per-user `@landadvisors.com` sender addresses** would let the composer's "From:" dropdown offer the signed-in user as a second option. Out of scope for now — single `cshiota@landadvisors.com` covers the immediate need.
- **Default builder classification on Excel import** still defaults to `private`; Chris to confirm whether `developer` should become the new default or whether more categories (REIT, institutional investor) are needed.

## Intentionally out of scope

Everything in this list was confirmed in discovery and is deferred to a future engagement or simply not part of this build:

- **AI features.** No LLM calls anywhere. No Anthropic SDK. The OM prose generation, Recommendation Memo, LOI parsing, SOO matrix from parsed LOIs, and tier-personalized email drafting are all deferred to a future engagement. Email templates are tier-aware via fixed templates, not AI-generated. Reference: CLAUDE.md "Scope Decisions Pending" item 2.
- **Direct Outlook / Microsoft Graph API integration.** Email automation goes through Resend, user reviews each draft in the platform UI and clicks send. The user's Outlook stays their primary email client for inbound and ad-hoc outbound.
- **Buyer logins.** The platform is purely internal to Lakebridge.
- **Persistent buyer master with cross-deal tier selection.** Builder/contact are separate entities; tiers attach per-deal. Excel import implemented; persistent buyer database with cross-deal state is a future enhancement.
- **AI-drafted tagging** on outputs. Chris confirmed he doesn't want it.
- **Dropbox replacement.** Items can hold Dropbox links (multi-link support shipped 2026-05-12), but documents stored in Vercel Blob and documents in existing Dropbox folders coexist; no migration of Dropbox content into the platform.
- **In-app notifications.** Email-only per discovery; no in-app notification UI.
- **SOO matrix generation from parsed LOIs.** The matrix template can exist (populated manually for now); LOI parsing is AI work and out of scope.
