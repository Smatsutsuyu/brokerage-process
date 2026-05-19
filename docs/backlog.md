# Backlog

Working list of identified improvements, fixes, and follow-ups. Populated 2026-05-19 from a four-agent sweep covering security, performance + database, code quality + consistency, and dependencies + production readiness.

Priority bands:

- **P0**: Block handoff. Fix in the next deploy or two.
- **P1**: Should fix before Phase 3 handoff.
- **P2**: Worth doing during Phase 3, but not blocking.
- **P3**: Optional, style, or defensible either way.

Effort: **S** (under an hour), **M** (a few hours), **L** (a day or more).

When you close one, mark `~~done~~` rather than deleting so the running record stays auditable.

---

## P0 — Block handoff

### [Security] Disable public Better Auth sign-up endpoint
- **What**: `src/lib/auth/auth.ts` enables `emailAndPassword` without `disableSignUp`, and the catch-all handler at `src/app/api/auth/[...all]/route.ts` exposes `POST /api/auth/sign-up/email`. Anyone on the internet can create an `auth_user` row. They cannot reach the app (no membership row), but they pollute the table and could trigger email-conflict edge cases later.
- **Fix**: pass `emailAndPassword: { ..., disableSignUp: true }` in the Better Auth config. The owner invite flow calls `auth.api.signUpEmail` server-side and is unaffected.
- **Effort**: S

### [Security] Open redirect on sign-in via `?from=` query
- **What**: `src/app/sign-in/sign-in-form.tsx` reads `params.get("from") || "/"` then `router.push(from)`. A crafted link can redirect post-signin to an off-domain phishing page.
- **Fix**: validate `from.startsWith("/") && !from.startsWith("//")` before push; fall back to `/`.
- **Effort**: S

### [Security] Last-owner safety not enforced on demote or disable
- **What**: `src/app/(app)/admin/actions.ts` `removeMember` correctly blocks removing the only remaining owner. `changeMemberRole` and `setMemberDisabled` do not. A sole owner can be demoted or disabled, locking everyone out of `/admin/members`.
- **Fix**: replicate the `ownerCount <= 1` guard in `changeMemberRole` (when target was owner + new role isn't) and `setMemberDisabled` (when target is the last enabled owner being disabled).
- **Effort**: S

### [Deps] Bump Next.js 16.2.4 → 16.2.6
- **What**: 13 advisories patched in 16.2.6 (XSS, cache poisoning, SSRF, middleware bypass). `package.json` pins exact version.
- **Fix**: bump `next` and `eslint-config-next` to `16.2.6`, `npm install`, smoke-test, push. Also resolves the bundled `postcss` < 8.5.10 advisory.
- **Effort**: S

### [Deps] Replace or relocate `xlsx@0.18.5` (unfixed high-severity advisories)
- **What**: Prototype pollution + ReDoS in SheetJS's legacy npm distribution; no patch on `0.18.5`. Used in `src/app/(app)/contacts/import-modal.tsx` for owner-side Excel uploads.
- **Fix**: switch to SheetJS's CDN-hosted patched build (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`) or replace with `exceljs`/`@e965/xlsx`. While you're in there, dynamic-import inside the parse handler so it stays out of the Contacts route's initial JS bundle (~400KB win).
- **Effort**: M

### [Ops] Add a root error boundary
- **What**: No `src/app/error.tsx` or `src/app/global-error.tsx` exists. With Sentry intentionally removed, an unhandled server-component throw renders Next's default error page with no branded fallback and minimal logging.
- **Fix**: add `src/app/global-error.tsx` that logs to `console.error` (Vercel ingests it) and renders a branded fallback. Optionally add a route-segment `src/app/(app)/error.tsx` so in-app crashes keep the sidebar chrome.
- **Effort**: S

---

## P1 — Fix before handoff

### [Security] Write-side cross-org IDOR on `dealId`-keyed mutations
- **What**: ~60 actions in `src/app/(app)/deals/[id]/actions.ts` accept `input.dealId` and insert rows tagging that dealId with the caller's `org.id`, but never verify the deal actually belongs to the caller's org. Read paths scope by org so the data isn't leaked, but a malicious authenticated user could pollute another tenant's deal with orphan rows. Theoretical at one tenant; exploitable once a second org exists.
- **Fix**: `assertDealInOrg(dealId, orgId)` helper called at the top of every action that takes `dealId` from the client. The pattern already exists at `src/lib/documents.ts` (`authorizeDealAccess`); generalize it.
- **Effort**: M

### [Security] Role gating on mutations (analyst / viewer)
- **What**: Per CLAUDE.md, viewers are read-only and analysts have limited writes. In practice, no mutation action checks `me.role`. Any signed-in org member can create deals, edit checklists, add team members, delete builders, etc.
- **Fix**: decide which roles can mutate which entities. Add a `requireWriter()` helper that rejects viewer (and optionally analyst on destructive paths). Apply at the top of mutation actions.
- **Effort**: M

### [Security] Revoke sessions when disabling a user
- **What**: `setMemberDisabled` stamps `users.disabled_at` but leaves `auth_session` rows valid (`getCurrentUser` returns null on next request, but cookies pass the proxy and existing tabs continue working until session expiry).
- **Fix**: when `disabled === true`, also `await db.delete(authSession).where(eq(authSession.userId, target.authUserId))` in the same flow.
- **Effort**: S

### [Perf + DB] Add indexes on the sidebar's hot path
- **What**: `src/components/layout/sidebar.tsx` runs a heavy GROUP BY join across `deals` + `checklist_categories` + `checklist_items` + `user_deal_orders` on every authenticated page render. Zero supporting indexes today.
- **Fix**: add a migration with btree indexes on `checklist_categories(deal_id)`, `checklist_items(category_id)`, and `deals(org_id)`. Also worth: `feedback_items(org_id, created_at desc)` for the admin feedback list ordering.
- **Effort**: S

### [Perf] Lift `<Sidebar />` into the app layout
- **What**: Every page in `(app)/` invokes `<Sidebar />` directly inside its page component, so the heavy GROUP BY re-imports per route. Moving it into `src/app/(app)/layout.tsx` centralizes it (still re-renders dynamically, but it's the single source).
- **Fix**: move `<Sidebar activeDealId={...} />` into the route group's layout. Active deal can come from a small client wrapper using `useSelectedLayoutSegments()` or a passed prop.
- **Effort**: M

### [Perf] Tighten over-broad `revalidatePath` calls
- **What**: `src/app/(app)/profile/actions.ts` and `src/components/layout/reorder-actions.ts` use `revalidatePath("/", "layout")` which invalidates every page below the root layout. Reordering one deal forces every deal page in the cache to re-fetch.
- **Fix**: scope to what actually changed. Reorder: `revalidatePath("/", "page")` plus the active deal. Profile: same plus `/profile`.
- **Effort**: S

### [Ops] Run a Neon PITR restore drill
- **What**: CLAUDE.md Phase 3 deliverable. Backups are presumed-working but never verified.
- **Fix**: spin up a Neon branch from a 24h-old PITR point, point a preview deploy at it, confirm the app boots and a deal page renders. Append result to `docs/build-progress.md`.
- **Effort**: M

### [Ops] Add a deploy-time type check before migrations
- **What**: `vercel-build` chain is `drizzle-kit migrate && rename:apply && checklist:reconcile && next build`. A type error blocks the deploy AFTER all pre-build migrations have run, which is wasteful.
- **Fix**: option A: prepend `tsc --noEmit` to `vercel-build`. Option B: add a GitHub Action that runs `tsc --noEmit && eslint` on push, blocking the merge before Vercel ever sees it.
- **Effort**: S

### [Ops] Decide on lightweight error reporting
- **What**: With Sentry removed, the only error signal is Vercel function logs that nobody actively watches. Several catch blocks `console.error` once and continue silently.
- **Fix**: pick one of: (a) Vercel Log Drains → Better Stack / Logtail (free tier, searchable queue + weekly digest, no code changes), (b) re-add a lightweight reporter like Highlight.io, or (c) explicitly document in `docs/operations.md` that the operator owns log-review cadence. Defensible to ship without; not defensible to leave undocumented.
- **Effort**: S (decide + document) or M (wire Better Stack)

### [Code Quality] Add zod validation on server actions
- **What**: `zod` is installed for env but no server action uses it. Most actions trust TypeScript types at the boundary; Next.js server actions are POST-callable by any authenticated user.
- **Fix**: at minimum, validate uuid shape on id fields and use `z.enum()` for tier / role / classification literal unions. A standard `validate(input, schema)` wrapper at the top of each action.
- **Effort**: M (sweep all actions)

---

## P2 — Worth doing during Phase 3

### [Code Quality] Extract one `PdfButton` from the three copy-pasted variants
- **What**: `marketing-report-pdf-button.tsx`, `qa-file-pdf-button.tsx`, `dd-tracking-pdf-button.tsx` are the same ~55-line component three times. Only the URL, label, and title differ.
- **Fix**: one `<PdfButton href={...} label={...} title={...} variant={...} />` and delete the three. ~100 lines removed.
- **Effort**: S

### [Code Quality] Extract `pdfResponse(buffer, { dealName, suffix })` helper
- **What**: All three PDF API routes repeat the same safeName regex, headers, `inline` Content-Disposition, `Cache-Control: private, no-store`, and `as unknown as BodyInit` cast.
- **Fix**: one helper in `src/lib/pdf/` centralizes the cast and the response shape.
- **Effort**: S

### [Code Quality] Extract the "builder has contacts on deal" EXISTS subquery
- **What**: Same EXISTS subquery hand-written in `src/app/(app)/builders/page.tsx`, `src/app/api/deals/[id]/marketing-report.pdf/route.ts`, and `src/app/(app)/builders/actions.ts`. Will be used in more PDF routes once the Compiled Package lands.
- **Fix**: `hasVisibleContactsOnDeal(dealIdExpr, builderIdExpr)` helper returning a Drizzle `sql` fragment.
- **Effort**: S

### [Code Quality] Split `src/app/(app)/deals/[id]/actions.ts` (2,262 lines)
- **What**: One file holds ~60 server actions across checklist, buyers, Q&A, issues, consultants, deal team, email blasts. Hard to navigate.
- **Fix**: split into `actions/{checklist,buyers,qa,issues,team,email}.ts` re-exported from `actions.ts` to preserve import paths.
- **Effort**: M

### [Code Quality] `withOrg()` + `revalidateDeal()` helpers
- **What**: Every action in the same file repeats the auth check and revalidate pattern. The pattern is uniform enough to safely extract; the auth check is also the security-critical guard.
- **Fix**: thin `withOrg(fn)` wrapper plus `revalidateDeal(id)`. Cuts ~120 lines and makes it harder to forget the org scoping.
- **Effort**: M

### [Perf] Move `xlsx` import inside the parse handler (also see P0 dep fix)
- **What**: Top-level `import * as XLSX from "xlsx"` in `import-modal.tsx` ships the full lib in the route's initial bundle.
- **Fix**: `const XLSX = await import("xlsx");` inside the onChange handler. Bundles with the P0 fix above.
- **Effort**: S

### [Perf] Parallelize the two follow-up queries in `loadBuyers`
- **What**: `src/app/(app)/deals/[id]/views/prototypes/load-buyers.ts` does the main contacts join, then a serial query for org users, then a serial query for org contacts. The two follow-ups are independent.
- **Fix**: `Promise.all` the two follow-ups, or all three queries from the start (none share data).
- **Effort**: S

### [Perf] Buyer-comments-editor effect resyncs too aggressively
- **What**: `useEffect` resets `draft` from `trimmedInitial` on every prop change. A sibling revalidation can wipe an in-flight edit.
- **Fix**: compare against `savedValue` state and skip when actively editing.
- **Effort**: S

### [Code Quality] Decommission the Contacts UX prototypes (B/C/D)
- **What**: `src/app/(app)/deals/[id]/views/prototypes/` ~1,847 lines across 4 option files + load-buyers. Chris picked Option A on 2026-05-12 as canonical. The other three layouts are still reachable via `?tab=proto-{b,c,d}` and the "Contacts layouts" strip in `deal-tabs.tsx`.
- **Fix**: move `OptionACards` + `load-buyers` out of `prototypes/` into `views/` proper. Delete options B/C/D, the `proto-*` tab branches, and the layout switcher strip. Confirm with Sean before deleting since the switcher was re-added intentionally as "Contacts layouts."
- **Effort**: M, after Sean's go-ahead

### [Code Quality] Sweep stale R2 naming
- **What**: `documents.r2Key` (legacy Cloudflare R2 name) persists in the schema + 4 source files even though we're on Vercel Blob since 2026-05-05.
- **Fix**: rename to `blobPathname` in a cleanup migration. Touch the 4 callers.
- **Effort**: S

### [Deps] Move `shadcn` and `@types/ws` to devDependencies
- **What**: `shadcn` is only invoked as a CLI (`npx shadcn add ...`), never imported. `@types/ws` is compile-time only. Both currently in `dependencies`.
- **Fix**: move both to `devDependencies`. This also eliminates the `hono`, `ip-address`, `express-rate-limit`, and `fast-uri` advisories which all chain through `shadcn → @modelcontextprotocol/sdk`.
- **Effort**: S

### [Deps] `npm audit fix` for `kysely`, `brace-expansion`, `ws`
- **What**: Pulled in transitively. `npm audit fix` upgrades cleanly per the agent's check.
- **Fix**: run `npm audit fix`, smoke-test.
- **Effort**: S

---

## P3 — Optional / nice-to-have

### [Security] Tighten `validateLinkUrl` protocol check
- **What**: `src/app/(app)/deals/[id]/actions.ts` checks `parsed.protocol.startsWith("http")` which accepts non-standard schemes like `httpa:`. Risk is low (browsers won't execute), but tighten for clarity.
- **Fix**: `protocol === "http:" || protocol === "https:"`. Also reject `parsed.username`/`parsed.password` to prevent `https://user@evil.example` stored as a link.
- **Effort**: S

### [Security] Delete unused `assertItemOnDeal` server action
- **What**: `src/app/(app)/deals/[id]/actions.ts:2254-2261` exports a server action that asserts item-deal-join but doesn't scope by org. Currently unused but reachable.
- **Fix**: delete (or add org scoping if you want to keep it).
- **Effort**: S

### [Security] Suppress recipient list in disabled-Resend log path
- **What**: `src/lib/email/send.ts:45` logs full `to` and `subject` when `RESEND_API_KEY` is unset. Useful in dev. In prod (where the key should always be set), if it weren't set every recipient + subject would land in Vercel logs.
- **Fix**: only log recipients when `NODE_ENV !== "production"`.
- **Effort**: S

### [Security] Add allow-list to `sendFeedbackSummary` recipient
- **What**: Owner-gated, so intended behavior, but the test-send accepts any recipient. Could be used as a spam relay.
- **Fix**: domain allow-list (`landadvisors.com`, `lakebridgecap.com`).
- **Effort**: S

### [Security] Validate `feedback.pagePath` is a same-origin path
- **What**: `pagePath` is user-supplied (sliced to 500) and rendered via `<Link href={...}>`. Today always same-origin since it's `usePathname()`, but defense-in-depth.
- **Fix**: require leading `/` at submission time.
- **Effort**: S

### [Perf] Banner streaming cache headers
- **What**: `src/app/api/deals/[id]/banner/route.ts` sets `max-age=300` (5 min). Banners change rarely; tab navigation re-fetches.
- **Fix**: bump to `max-age=3600, stale-while-revalidate=86400`. Upload modal already cache-busts via `?v=previewKey`.
- **Effort**: S

### [Code Quality] Spread the `{ ok, error }` Result pattern beyond `createBuilder`
- **What**: Only `createBuilder` uses the Result return shape (deliberate per a comment in the file); every other action throws. Mixed convention.
- **Fix**: extend to actions whose error messages users need to read (deletion guards, name conflicts, owner-only checks). Or document why only `createBuilder` is special.
- **Effort**: M

### [Code Quality] Normalize migration naming
- **What**: 0025/0026/0027 use descriptive names (good). 0028 reverted to Drizzle's auto-namer. Trivial drift.
- **Fix**: pick one convention going forward.
- **Effort**: nil (just discipline)

### [Deps] Add Metropolis font LICENSE.txt
- **What**: Bundled at `src/lib/pdf/fonts/Metropolis-{Bold,Regular}.ttf` without an accompanying LICENSE. Source is public-domain per the dw5/Metropolis fork.
- **Fix**: drop `src/lib/pdf/fonts/LICENSE.txt` (one paragraph noting source + public-domain status). Bonus: one line in handoff doc noting LAO owns `public/lao-logo.jpg`.
- **Effort**: S

### [Deps] Outdated minor/patch bumps (all safe)
- **What**: `@base-ui/react`, `@vercel/blob`, `better-auth`, `lucide-react`, `resend`, `tailwindcss`, `tsx`, `zod` all have safe minor/patch updates available.
- **Fix**: single `npm update` sweep.
- **Effort**: S

---

## Pending / uncommitted (carried over)

### Team-add Select uncontrolled→controlled warning
- **Status**: fixed, uncommitted in working tree.
- **What**: `src/app/(app)/deals/[id]/views/team-add-modal.tsx:413` Select started uncontrolled (`value={row.roleLabel ?? undefined}`), flipped to controlled once a role was picked. Changed to `value={row.roleLabel ?? null}` (Base UI's "no selection" sentinel).
- **Fix**: already in working tree. Commit on the next batch.

---

## Recently noted clean areas (audit findings worth recording so we don't re-litigate)

- **SQL injection**: every `sql\`\`` usage is parameterized. No raw string interpolation of user values.
- **XSS / template injection**: zero `dangerouslySetInnerHTML`, zero `eval`, zero `innerHTML =`. React-PDF and React Email properly escape user values.
- **Blob upload safety**: per-kind authorization, MIME allow-list, `head()` re-verification before metadata write. No path-forgery vector.
- **Cross-org read isolation**: every read scopes by `org_id`. No IDOR on read paths.
- **Secrets handling**: no hardcoded keys; `@t3-oss/env-nextjs` properly splits server vs `NEXT_PUBLIC_*`.
- **CSRF**: Next.js server actions get built-in origin validation; Better Auth session cookies are SameSite=Lax.
- **N+1 queries**: none. Every loader single-queries or uses `inArray`/EXISTS and buckets client-side.
- **Drizzle connection pooling**: correct singleton-on-`globalThis` pattern with `max: 5`.
- **PDF routes**: correctly `nodejs` runtime, `no-store` cache, React-PDF only in route handlers (not client bundles).
- **`getCurrentOrg` / `getCurrentUser`**: properly wrapped in React `cache()` so page + sidebar + children share one DB round-trip per request.
- **Migration meta**: `prevId` chain unbroken across hand-written 0025/0026/0027 and auto-generated 0028.
- **Comment quality**: high but on-topic; comments consistently explain non-obvious "why" rather than restating "what."
- **TypeScript strictness**: zero `: any` in source. All `as unknown as` casts are documented and bridge known typing gaps (`ws`, `BodyInit`).
- **TODOs**: only 2 in source, both intentional roadmap notes.

---

## How to use this list

When picking work, default order: P0 → P1 → P2 → P3. Within a band, prefer items in the area you're already in (don't context-switch unless the gap is meaningful).

When closing an item:

1. Strike through the title with `~~` and append `(done YYYY-MM-DD, commit <sha>)`.
2. If the close changed a documented invariant, update the relevant doc (schema.md / operations.md / features.md per [feedback_documentation_discipline.md](../../.claude/projects/c--Users-Sean-Documents-Chris-Consulting-brokerage-process/memory/feedback_documentation_discipline.md)).
3. Don't delete the entry — the strikethrough preserves the audit trail.

To re-run the sweep that produced this list, spin up the four parallel agents from the 2026-05-19 conversation: security audit, perf + DB review, code quality + consistency, dependencies + production readiness. Each returns a structured report that synthesizes into a new revision of this file.
