# Status Log — Lakebridge Capital Deal Lifecycle Platform

Running record of work, decisions, deferrals, and blockers. Newest day at top. Source for on-demand status reports (daily, weekly, client-facing, etc.).

---

## 2026-07-15 — Audit log wired to owner mutations

### Done
- **New `writeAudit()` helper** at `src/lib/audit.ts`. Fire-and-forget wrapper around `db.insert(auditLog)` that swallows errors so a failed audit write never breaks the mutation it's journaling. Takes `{ orgId, userId, action, entityType, entityId?, before?, after?, metadata? }`.
- **All five owner-only mutations in `admin/actions.ts` now emit audit rows** with a `<entity>.<past_tense_verb>` action string and the actor's user id:
  - `inviteMember` → `member.invited` (after: `{ email, name, role }`, entityId: newly-inserted user's uuid via `.returning()`)
  - `removeMember` → `member.removed` (before: `{ role }`, entityId: the now-deleted user's uuid — safe because `audit_log.entity_id` has no FK)
  - `changeMemberRole` → `member.role_changed` (before: `{ role: old }`, after: `{ role: new }`). Pre-fetches the current role; no-ops silently if the new role matches so we don't spam audit rows on repeat clicks.
  - `setMemberDisabled` → `member.disabled` or `member.re_enabled` (before / after: `{ disabledAt }`). Same idempotency guard.
  - `resetMemberPassword` → `member.password_reset` (no before/after/metadata — the action's existence is the record; deliberately no plaintext or hashed password on the row).
- **Audit writes happen post-transaction** so a failed audit can never rescue a bad mutation. Errors log to `console.warn` with `[audit] failed to write entry` prefix (searchable in Vercel function logs).

### Decisions
- **`entityType = "user"`** for all five mutations (matches the underlying `users` table). "member" is the UI-facing noun but "user" aligns with schema.
- **No UI yet** — the user asked for wiring only. A future `/admin/audit-log` page will surface these; today they land in Postgres for direct query (`select * from audit_log order by created_at desc limit 50` is fine).
- **`.returning()` with no args** on the `inviteMember` insert, not `.returning({ id: ... })`, to sidestep the union-type mismatch between `neon-serverless` and `postgres-js` (documented workaround, same pattern as `dedupe-builders.ts` scripts).
- **Idempotency guards** on `changeMemberRole` and `setMemberDisabled` — refuse to write an audit row when the mutation would be a no-op. Prevents audit noise from double-clicks or racing form submissions.
- **Never log the plaintext or hashed password** on `member.password_reset`. The modal already shows the temp password once to the owner; no audit reason to persist it a second time.

### Deferred / Pending
- `/admin/audit-log` viewer (filterable by action + entityType + date range). Wiring is a prerequisite for the viewer, which lands separately.
- Audit coverage beyond owner-only mutations — deal creates, checklist completions, document uploads, feedback status changes. Every mutation-side action in the app is fair game; scope is currently owner-only per Chris's ask.

### Blockers
- None.

---

## 2026-07-15 — Contacts layout switching perf fix

### Done
- **Contacts layout switching is now client-side.** Chris flagged a 200-1000ms lag when clicking the layout picker. Root cause: the picker was calling `router.replace()` on every click, which is a full Next.js navigation — App Router re-fetches the RSC payload for the new URL, which re-runs `page.tsx` → `ContactsView` → `loadBuyers()` DB query. Every layout switch paid a full server render + DB roundtrip to re-arrange data we already had in memory.
- **Fix:** split the picker into a controlled component and introduced `ContactsLayoutSwitcher` (client) as the parent. Server component (`ContactsView`) still loads buyer data once on the initial page load and hands it in via props. Layout state now lives in `useState` inside the switcher; picker clicks call `setState` locally and sync the URL via `window.history.replaceState()` (no Next navigation). URL still updates so bookmarks / shares keep working; the `?layout=` param on initial load still SSRs the correct layout via `parseLayoutParam`.
- Switching cost drops from ~200-1000ms per click to ~10ms (pure client-side React re-render, no network, no DB).
- Also: reverted the Contacts tab lead-picker deal-team scoping (commit `ba00b9f`) — Chris pointed out he was a lead on some buyers without being on the Deal Team roster, so the filter was hiding legitimate options. Issues assignee scoping stays (Chris's explicit ask); memory rule added at `feedback_deal_team_picker_scoping.md`.

### Decisions
- **`history.replaceState`, not `router.replace`.** The whole point of the fix is to avoid Next's navigation. Bookmarkability is preserved because the URL still updates; server-side SSR of the initial layout still works because the switcher receives `initialLayout` as a prop derived from the URL.
- **Lazy render, not render-all-hidden.** Only the active layout mounts. Switching resets in-layout local state (expanded cards, filter chips), which matches today's behavior since today's URL change also reloads the component. Render-all-hidden would preserve state across switches but pays the mount cost of all four upfront on every Contacts navigation — not worth it for a rare interaction.
- **Sanity fallback in the switcher.** If `layout` state somehow lands on an invalid key, render "a" instead of throwing. Belt-and-suspenders — `parseLayoutParam` on the server side and the picker's own union type on the client side both gate this, so it should never trigger.

### Deferred / Pending
- None.

### Blockers
- None.

---

## 2026-07-15 — Contacts layouts promoted to first-class + lead picker fix

### Done
- **Lead picker on the Contacts tab now scoped to Deal Team members** (commit `5297e03`). Same pattern as the Issues assignee fix earlier today: `deal_team_members` inner-join to `users`, dedupe by user id, backward-compat straggler union for anyone currently assigned as a lead but since removed from the team. Change is in `contacts-layouts/load-buyers.ts`.
- **Contacts layout system reworked.** The four alternate arrangements (Cards / Pane / Grouped / Compact) that had been hiding behind an amber-dashed "experimental" strip are now first-class citizens with a proper in-tab picker. Directory `views/prototypes/` renamed to `views/contacts-layouts/`. New `layout-keys.ts` is the single source of truth for the four layout options. New `contacts-layout-picker.tsx` is a small segmented-control client component that reads/writes a `?layout=` URL param. The top-level `proto-a/b/c/d` deal tabs are gone; a Contacts URL is now `?tab=contacts` (default Cards) or `?tab=contacts&layout=b|c|d`.
- **`ContactsView` promoted to the switcher.** Loads buyer data once via `loadBuyers`, renders the picker, then renders the chosen layout. `prototype-views.tsx` deleted (its `builderGroupsOnly` filter for B/C/D moved into `ContactsView` since B/C/D still don't handle the Unaffiliated bucket).
- **Dead code deleted.** `contacts-table.tsx` (orphan, zero callers, same "all org users" bug the lead-picker fix addressed). `getLeadOptionsForOrg()` in `deals/[id]/actions.ts` (orphan, zero callers, same all-org-users query pattern).
- **Backlog groomed.** The "Decommission Contacts UX prototypes" entry removed (superseded by this promotion). The `loadBuyers` parallelization entry updated to the new path.

### Decisions
- **Kept B/C/D feature-stubbed** rather than bringing them up to full parity with Cards. Chris uses Cards daily; B/C/D exist as alternate arrangements for design comparison and occasional visual inspection. Investing 6-10 hours to teach them the Unaffiliated bucket + FeedbackZone wiring + all shipped-since-June flags is premature until someone actually picks one as their preferred view. The four-layout URL surface is the commitment; feature parity remains conditional.
- **Selector inside the Contacts tab, not a top-level tab strip.** Four `proto-*` top-level tabs plus an amber "layout switcher" strip was redundant and confusing. The new model: one `Contacts` tab, one layout picker sitting at the top of that tab's content. Bookmarkable via `?layout=` on the URL. Leaving the Contacts tab drops the `layout=` param automatically so it doesn't stick as noise on Checklist or Issues.
- **Deleted `contacts-table.tsx` outright.** No callers, obviously stale (predates the deal_contacts model based on its imports), and it duplicated the "all org users" lead-picker bug we just fixed. Keeping it would have been a booby-trap for the next person searching for a template.
- **No forced shared-component extraction across the four layouts.** The primitives that should be shared (`LeadPicker`, `TierBadge`, `BuyerCheckbox`, `AddContactModal`, `PickExistingContactModal`, `MarketingReportPdfButton`, `OmBlastButton`, `BuyerCommentsEditor`, `ReceivesCommunicationToggle`) already are. Layout-level structure (how contact rows arrange, where the tier chip lives relative to the lead picker) is genuinely divergent by design. Forcing a shared `ContactRow` component today would require prop bloat to accommodate all four arrangements, for negligible savings.

### Deferred / Pending
- Bring B/C/D up to Cards parity if one of them ever gets picked as a preferred daily view. Includes: Unaffiliated bucket rendering, `FeedbackZone` wiring under `deal-contacts`, per-contact `ReceivesCommunicationToggle`, `BuyerCommentsEditor`, offer-received flag, deal-team-aware lead picker consumption (already correct at data layer via `loadBuyers`).
- Historical feedback rows with `section = "contacts-prototypes"` still exist in the DB and remain visible in `/admin/feedback` — the section slug no longer maps to a live surface, but the row content is preserved and the deal-id link still works.

### Blockers
- None.

---

## 2026-07-15 — Feedback triage: Send CTC button + Issues assignee scope

### Done
- **Send CTC button on the Phase 1 Cost to Complete row** (feedback item `3b9ddf75`, from Larry Nguyen 2026-07-07). Mirrors the Share Market Study pattern: `BuyerBlastButton` with `requireAttachment="file"` gates on an uploaded CTC PDF before opening the composer, defaults to green/yellow buyers. New `CTC_DISTRIBUTION_TEMPLATE` in `email-templates.ts`, new `isCtcItem` matcher in `phase-section.tsx` with `receive`/`finalize` exclusions so the button fires only on the Phase 1 row (not on the two Phase 4 milestone date rows). Commit `4e70108`.
- **Issues tab assignee picker scoped to Deal Team** (feedback item `0c0356cf`, from Chris 2026-07-15). Previously the "Assigned to" dropdown listed every user in the org. Rewrote the query in `issues-view.tsx` to join `deal_team_members` and only offer members with a linked `userId` on this deal. Backward-compat straggler union preserves any currently-assigned user in the picker even if they've since been removed from the team, so editing an existing issue doesn't silently drop the assignee. Commit `75329da`.
- Both fixes ship-tested statically (typecheck clean; matcher walked against every "cost to complete" row in the template — only the Phase 1 row matches). Sean will smoke-test in the live environment after Vercel auto-deploys.

### Decisions
- **CTC send mirrors Market Study, not DD Folder** — the CTC report is a single uploaded PDF (like the market study), not a link-or-file bundle (like the DD folder). So `requireAttachment="file"` (not `"any"`) is the correct pre-flight gate.
- **Issues assignee gate is UX-only, not authz.** Server-side `addIssue`/`updateIssue` don't validate deal-team membership; a compromised client could still send any org user id. Matches today's behavior — we're not tightening the trust boundary, just the picker's shown options.
- **Backward-compat union is on the client-side Map, not a UNION in SQL.** Simpler to reason about, no distinct-rows concerns, and the straggler set is bounded by the deal's issue count (small).

### Deferred / Pending
- **Contacts lead-picker uses the same "all org users" pattern.** Chris may or may not want the same deal-team scoping there. Not in scope for this feedback item; worth surfacing next time he's iterating on the Contacts tab.
- Feedback items will be marked `actioned` after Sean confirms the fixes in the live environment.

### Blockers
- None. Docker Desktop not running locally so no browser-driven smoke test today; static verification stands in.

---

## 2026-07-03 — Owner-triggered password reset + first-login set-password

### Done
- **New `mustSetPassword` boolean column on `users`** (migration `0030_cooing_shotgun.sql`). Default false. Flipped true by an owner-triggered reset, cleared by the user's next `setOwnPassword` call. `getCurrentUser` returns it as part of the shape so every consumer sees the flag.
- **`(app)/layout.tsx` is now async** and gates on `mustSetPassword`: if the flag is set, the layout redirects to `/set-password` before rendering children. Individual page components still handle their own sign-in redirects; the layout only intercepts signed-in-mid-reset users. The extra DB call is free thanks to `React.cache()` inside `getCurrentUser`.
- **New `/set-password` route** (server page + client form + `setOwnPassword` server action). Server page redirects to `/sign-in` when not authenticated and to `/` when the flag is already cleared, so it can never sit as a dead-end. Client form asks for new password + confirm (no current-password prompt — the user just proved identity by signing in with the temp). Action hashes via `hashPassword` from `better-auth/crypto`, writes to `auth_account.password` for the `providerId = "credential"` row, clears `users.must_set_password`, and calls `revalidatePath("/", "layout")` so the layout gate re-reads on the next navigation.
- **New `resetMemberPassword({ userId, newPassword })` server action** in `admin/actions.ts`. Owner-gated. Refuses to reset self (owner still needs an invariant "prove identity via sign-in" path for their own account, currently unbuilt). Hashes the temp password, updates the target's credential-account row, flips `must_set_password`, and — inside the same transaction — deletes every one of the target's `auth_session` rows so any stale browser tab gets kicked out.
- **New Reset PW button on every member row** in `/admin/members` next to Disable and Remove. Opens `ResetPasswordModal` (new component next to `InviteMemberModal`, same shape: adjective-noun-### generator, Regen button, error surface, then a success view with the temp password on screen and a Copy button). Same generator function as invite so both flows produce identical-looking credentials.

### Decisions
- **Temp password, not one-time link.** The invite flow already hands the owner a temp password to share out-of-band; reset mirrors that. A signed one-time link would need a Resend template plus a new tokens table plus expiry logic, none of which pays off at Lakebridge's team size. Documented tradeoff in the design proposal.
- **Force a fresh password on first sign-in after reset, not just accept the temp.** The whole point of the flow is the owner never learns the user's real password. If the temp were acceptable long-term, the owner could keep using it, which defeats the reset. So the `must_set_password` gate is unconditional.
- **Session invalidation is part of the reset transaction.** Not a separate step, not a follow-up call. If we skipped it, a browser tab still authenticated with the OLD password's session would silently keep working until it expired.
- **Reset uses `hashPassword` from `better-auth/crypto`, not `auth.api.updatePassword`.** The Better Auth admin-triggered update path expects a session for the target user, which we don't have when doing this owner-to-target. Direct hash + Drizzle write is cleaner and matches what Better Auth's own `update-user` route does internally (`ctx.context.password.hash` under the hood is the same scrypt implementation).
- **Invite flow left unchanged.** New invitees still get the owner-picked temp password without the `must_set_password` gate — the same behavior as before. Consideration to force set-password on invitees too was noted as a possible follow-up, not shipped here.

### Deferred / Pending
- Owner cannot reset their own password from this flow. The Better Auth `changePassword` client method already exists but there's no profile-page control to expose it yet. Track as a small follow-up.
- Invite flow doesn't currently flip `must_set_password = true` for new invitees. Could be a two-line change if we want the same first-login prompt for new users; leaving it out until Chris asks so scope stays tight.

### Blockers
- None.

---

## 2026-06-17 — B&F invite hard-gated on row date

### Done
- **`{{bnfDueDate}}` now resolves from the row itself.** Added `dateField: true` to the Phase 3 "Send out B&F" item in `CHECKLIST_TEMPLATE` so it gets the same milestone-date affordance as Offering Date / LOI Signed / Closing Date. No migration needed — `isItemDateField` reads from the template at runtime, so every existing deal's row picks up the date chip on next render.
- **New `getBnfDueDate({ dealId })` server action** reads the "Send out B&F" row's `trackedDate`. `getOmBlastTemplateContext` now adds `bnfDueDate` to the vars dictionary alongside `dueDate`, formatted via the same local-time `formatOfferingDate` helper (no extra round-trip — both pulled from the same checklist query).
- **`BuyerBlastButton.requireBnfDate` prop** — sister of `requireOfferingDate`. When set, the click pre-flight refuses to open the composer if the B&F date isn't set and surfaces the existing inline red bubble with "Set the B&F due date on this row first, then send."
- **Phase 3 B&F row** swapped from `disableSend` to `requireBnfDate`. The composer's final Send button is enabled now (since the date gate prevents an empty-`{{bnfDueDate}}` send), and the row's date chip is the single source of truth for the invite due date.
- **Broker Team default-CC on OM blast.** `getOwnerTeamCcOptions` generalized to `getDealTeamCcOptions({ dealId, team })` so the same loader returns owner-team or broker-team members based on the `team` arg. Sentinel IDs use `${team}:` prefixes (`owner:` / `broker:`). The CcPicker `CcGroup` union and `GROUP_LABEL` record gained the `"broker"` / "Broker Team" entry. `BlastModal` loads both teams in parallel and merges into the CC options under three sections (Owner Team → Broker Team → Org Members). New `defaultCcTeams?: Array<"owner" | "broker">` prop on `BlastModal` and `BuyerBlastButton`; when set, the modal augments every builder's initial CC selection with the corresponding team's sentinel ids so they're pre-checked on open. `OmBlastButton` passes `defaultCcTeams={["broker"]}`. Persistence filter on `onCcChange` strips both `owner:` and `broker:` sentinels (deal-team picks stay per-send rather than persisting to `deal_buyers.cc_user_ids`).

### Decisions
- **Hard gate, not soft confirm.** The B&F invite body says "Best and Final offers must be submitted by 12:00 p.m. on (date)" — that's nonsense without a date, so blocking is correct. Same rationale as the 1-week notice.
- **Empty Close-of-Escrow and Closing-Conditions sections stay empty in the template.** Per Chris: those are filled in inline at compose time, deal by deal. The composer's `<textarea>` accepts whatever bullet character the user types (`-`, `•`).
- **No rich-text editor.** Plain-text bodies have better deliverability and simpler reply handling. ASCII / Unicode bullet characters render in every email client.

### Deferred / Pending
- Logging the 2026-06-04 Offering Date wiring work in the time-log (committed but not yet recorded).

### Blockers
- None.

---

## 2026-05-29 — Offering Date wiring, B&F skeleton, Send Marketing Report on Contacts tab

### Done
- **`{{dueDate}}` is now resolved.** New `getOfferingDate({ dealId })` server action returns the deal's Offering Date Phase 2 milestone trackedDate (loose substring match). `getOmBlastTemplateContext` includes `dueDate` in its vars, formatted as `"Friday, May 29, 2026"` (built via local-time Date parts to avoid the YYYY-MM-DD UTC-midnight shift).
- **OM blast template** now carries the offers-due line in the body. `OmBlastButton` runs an Offering Date soft check after the attachment check: if set, the dated body goes through; if unset, a confirm dialog ("Set date first" / "Send without date") asks whether to proceed with `OM_BLAST_TEMPLATE_NO_DATE` which drops the line entirely.
- **1-week offers-due notice button** gets a hard pre-flight. `BuyerBlastButton.requireOfferingDate` refuses to open the composer if the Offering Date isn't set, using the existing inline red bubble pattern.
- **Send Marketing Report on the Contacts tab toolbar.** Added the existing two-step PDF-preview-then-email flow as a `compact={false}` button next to Marketing Report and Internal Report on all four prototype toolbars (A live, B/C/D preserved).
- **B&F invite skeleton.** New `BEST_AND_FINAL_INVITATION_TEMPLATE` matching Chris's stock B&F prose with `{{units}}`, `{{dealName}}`, `{{bnfDueDate}}` (placeholder, awaiting date source), `{{senderName}}`. New `isSendBnfItem` matcher in phase-section.tsx renders a `BuyerBlastButton` on the Phase 3 "Send out B&F" row labeled "Send B&F". The composer opens normally so the draft can be exercised; only the final Send button in step 2 is disabled, with a tooltip naming the open items.
- **BuyerBlastButton gained `disableSend` + `disableSendReason` props** for skeleton-row UX. They thread through `BlastModal` to `EmailPreviewBody`'s Send-button render. The trigger button stays fully enabled.

### Decisions
- **OM blast Offering Date check is soft; 1-week notice is hard.** OM blasts often go out before the offers-due deadline is finalized, so blocking would be too restrictive. The 1-week notice template body says "Offers are due in a week on (date)" which makes no sense without a date, so blocking is correct.
- **No B&F due date source yet.** Chris is following up on where the B&F deadline lives (it's not currently a checklist milestone). For now `{{bnfDueDate}}` stays unsubstituted; the button stays disabled until both the date source and the empty section language are sorted.

### Deferred / Pending
- B&F due date source + Close-of-Escrow and Closing-Conditions language (blocking the B&F invite send).
- Other Phase 4 milestones (Investment Committee, Feasibility, Closing) might benefit from the same date-substitution treatment when their reminder templates exist.

### Blockers
- None.

---

## 2026-05-21 — OM blast tracking, dev sender override, tier-tinted recipient list

### Done
- **OM blast tracking** unified under a single `omSentTracking` prop on `BlastModal`, opt-in by `OmBlastButton`. Four behaviors:
  1. Step 1 builder header shows an amber "OM sent MMM D" chip for builders whose `deal_buyers.om_sent_at` is set.
  2. Step 2 paginator shows the same as a banner above the active builder's preview.
  3. Builders in the "previously OM-sent" set are auto-unchecked on each open (once recipients load). User can re-check individuals to override; the override sticks across in-session filter changes.
  4. After a successful blast, every `ok: true` builder gets their `om_sent_at` flipped to now via new server action `markBuildersOmSent` (single UPDATE, plus `revalidatePath` so the contacts tab toggle updates).
- **OM blast attachment pre-flight.** Clicking "Send OM blast" now resolves the OM item id eagerly, fetches attachments, and refuses to open the composer if no uploaded file is present. Two messages: "No OM row on this deal. Add the Phase 1 OM checklist item first." vs "No Offering Memorandum attached. Upload the OM file to the Phase 1 row first, then send." Same inline-bubble pattern as Market Study / DD Folder.
- **Tier-tinted recipient list.** Each builder group in Step 1 gets a `bg-{green|yellow|red|gray}-50` + matching border based on tier so multi-tier blasts read their groups at a glance.
- **`DEV_BLAST_SENDER_EMAIL` env var** added to `src/lib/env.ts`. Swaps just the email on the composer's hardcoded Chris sender; display name stays. Lets local dev route blasts through a verified Resend domain (e.g. `noreply@portal.lakebridgecap.com` on the portal account) without touching production. Documented in `.env.example` and operations.md.
- **`previewBlastRecipients` + `BlastPreviewRow`** gained `omSentAt: Date | null` from `deal_buyers`; `BlastModal`'s grouped map carries it alongside tier so the chip and color come from the same memo.
- **`EmailPreviewBody`** gained an optional `priorSendNotes?: Record<string, string>` prop — the Step 2 banner driver. Kept generic so similar "X already happened" notes can be layered on other blasts later.
- **Docs swept**: features.md ("OM blast tracking" section + tier-tinted recipient note + Send OM blast added to attachment-gate list), build-progress.md (new entry), operations.md (DEV_BLAST_SENDER_EMAIL env), status-log.md (this entry).

### Decisions
- **One prop, three behaviors.** `omSentTracking` collapses the warn chip + auto-uncheck + mark-after-send into a single switch. Other blasts (CA, Q&A, Market Study, DD Folder) don't opt in, so their flows are unchanged.
- **Auto-exclude is per-open, not per-load.** `autoExcludeApplied` flag fires the auto-uncheck once after the first recipient load on each modal open. Subsequent filter changes don't re-apply, so manual check-overrides don't get wiped when the user widens or narrows the tier filter mid-session.
- **`DEV_BLAST_SENDER_EMAIL` overrides email only, not display name.** Keeps "Chris Shiota" as the visible sender even in dev — fewer surprises if someone opens a sandbox-sent message.

### Deferred / Pending
- Similar "prior action" tracking for other blasts (e.g. "CA already signed" for the Confidentiality Agreement blast) is structurally ready — `priorSendNotes` is generic. Wire on demand.

### Blockers
- None.

---

## 2026-05-21 — Blast send throttle + rate-limit retry

### Context
- Feedback that something limits sending to ~5 emails/sec. Confirmed the cause: the blast loop in `src/lib/email/blast.ts` was sequential but unthrottled, so fast Resend responses could burst past the account's per-second cap on a large blast (one email per builder). The "5/sec" is Resend's server-side rate limit (429 `rate_limit_exceeded`), not our code.
- Tried to reproduce locally with a 6-builder seed; 6 sequential sends at normal latency didn't pile up fast enough to trip it. Decided to ship the throttle anyway since a production OM blast hits 20-30+ builders and the feedback was real.

### Done
- **Throttle**: minimum gap between send starts, `SEND_INTERVAL_MS` (default 250ms ≈ 4/sec). Shipped as a constant (`DEFAULT_SEND_INTERVAL_MS`) with an env-var override (`SEND_INTERVAL_MS`, added to `src/lib/env.ts`); `0` disables.
- **429 retry**: `sendWithRateLimitRetry` retries rate-limited sends up to 3× with linear backoff; other failures return immediately.
- **Diagnostics**: `sendEmail` logs `name` + `statusCode` and prefixes rate-limit errors with `[rate-limited]`; blast loop logs `[blast:send]` per send + `[blast:rate-limit-retry]` on backoff.
- **Local repro harness**: additive `src/db/seed-email-test.ts` + `npm run db:seed:email-test` ("RL Test — Rate Limit" deal, `BUILDER_COUNT` builders, `seanesparza+rlN@gmail.com` contacts). Documented in `docs/local-development.md`.
- **BCC restored** after a temporary removal during testing (see Decisions).

### Decisions
- **Throttle + retry, not Resend's Batch API.** Batch sends up to 100 in one request (one rate-limit unit) but doesn't support attachments, which most blasts carry. Throttling handles attachment and non-attachment sends uniformly.
- **Env-overridable interval.** Ship a sane constant default, let ops tune via `SEND_INTERVAL_MS` without a deploy if Resend's cap changes.
- **BCC stays.** Removed it briefly to keep test runs out of Chris's inbox, then restored — it's how the sender gets a mailbox copy (Resend doesn't post to Outlook Sent Items).

### Deferred / Pending
- Couldn't reproduce the 429 at 6 builders locally; if it needs confirming, bump `BUILDER_COUNT` or drop `SEND_INTERVAL_MS` to 0 in the seed/env and re-run.

### Blockers
- None.

---

## 2026-05-21 — UI polish, attachment guards, DD folder send

### Done
- **LAO favicon.** Cropped the triangle icon from the LAO logo JPG, knocked out the white background to transparent, padded ~22% so it doesn't touch tab edges. Emits `src/app/icon.png` + `apple-icon.png` via Next.js App Router file conventions; old `favicon.ico` removed.
- **Deal options menu** in the deal header replaced the muted 3-dots icon with a labeled "Edit" button (pencil + label + chevron, with a visible border at rest). Reads as a clickable affordance instead of a hint.
- **Sidebar deal list now uses `@dnd-kit/sortable`** for drag-to-reorder. Thin always-present grip-handle gutter on the left; row title gets the full first row; phase chip moved to the end of row 2 next to the progress bar. New `reorderDeals(orderedIds[])` server action persists the full ordering in one round-trip.
- **`InlineErrorBubble` + `useInlineError` hook** (new `src/components/inline-error-bubble.tsx`) — reusable rejection-bubble pattern for row-button click validation. Bubble is centered horizontally on the trigger, sized to content's natural width (`w-max` + 320px cap so it doesn't wrap word-by-word inside a narrow parent), and viewport-clamped via a `useLayoutEffect` measurement so it never overflows the screen edge when the trigger is near a viewport boundary. Documented in the file's header comment as the convention for any future "send a file and/or link in an email" row button.
- **Phase 2 attachment pre-flight guards.** `BuyerBlastButton` gained `requireAttachment="file" | "any"` + `attachmentNoun`. Send Market Study uses `"file"`; new Send DD Folder (for the "Share Marketing Due Diligence Folder" row) uses `"any"` since these are usually shared as a Dropbox / SharePoint folder URL. Rejection surfaces an inline red bubble anchored under the button. Network errors during pre-flight still go through sonner.
- **New `SHARE_MARKETING_DD_TEMPLATE`** email body for the DD folder share.
- **Sonner description text globally darkened** to `!text-gray-700` so toast body copy is readable on white instead of the default near-invisible muted gray.
- **Docs sweep.** CLAUDE.md Phase 2 callout, operations.md (Sender BCC + Attachment pre-flight subsections), build-progress.md (new daily entry + email pipeline follow-ups for BCC and the no-reply rename), features.md (attachment-gate section + sender/BCC explanation) all brought into sync with shipped behavior.

### Decisions
- **Inline bubble, not sonner toast, for row-button validation rejections.** Sonner stacks in a fixed corner and can't tell the user which lookalike "Send …" button failed. The inline bubble is anchored to the failing button — unmissable. Codified in the `InlineErrorBubble` header comment.
- **Two-mode validation.** File-required vs file-or-link distinguishes "recipient needs the document attached" sends (Market Study, Q&A File) from "a folder URL is fine" sends (DD folder).
- **Drop the old hover-arrow reorder UI.** Drag handle in a dedicated gutter is the clearer affordance; arrows were clipping the phase chip / priority star.

### Deferred / Pending
- Per-user `@landadvisors.com` sender addresses — would let the composer offer the signed-in user as a second "From" option.
- Old `moveDealUp` / `moveDealDown` server actions still exist with no UI callers — keeping them around in case anything external depends on them; safe to delete later.

### Blockers
- None.

---

## 2026-05-20 — Email pipeline live cutover (landadvisors.com)

### Done
- DNS records for `landadvisors.com` are in and the Resend domain is verified. Resend consolidated to a single account (landadvisors); the older lakebridgecap.com Resend instance is being retired. `RESEND_API_KEY` in Vercel already swapped to the landadvisors key.
- Extended `sendEmail()` to accept per-call `from`, `cc`, `attachments` overrides while preserving the `EMAIL_FROM` fallback for the feedback pipeline.
- New `src/lib/email/blast.ts` with `sendResolvedEmails(emails, { orgId })`: org-scoped lookup of file attachments in `documents`, fetch bytes from Vercel Blob, sequential per-builder sends (rate-limit-friendly), partial-failure reporting per builder.
- New `sendBlastEmails` server action in deal actions: thin org-scope wrapper around `sendResolvedEmails`.
- `BlastModal` and `DealTeamSendButton` now call the real action — toast reports `sent / failed` counts and lists per-builder reasons on partial failure. Removed the "Preview only — sending isn't wired up yet" footer + the mock-send fallback comments.
- Simplified the composer's sender dropdown to a single fixed option, `cshiota@landadvisors.com` (Chris-only). Per-user landadvisors addresses can come later without changing the modal.
- `.env.example` `EMAIL_FROM` updated to `no-reply@landadvisors.com`. CLAUDE.md + operations.md + build-progress.md updated to reflect the single-account / single-domain consolidation.
- Typecheck passes clean.

### Decisions
- **Sender dropdown drops the signed-in-user fallback.** Per Chris: everyone sends as Chris from landadvisors for now. Users sign in with `@lakebridgecap.com` addresses which can't be used as a sender without a separate domain verification.
- **Single Resend account, landadvisors.com only.** Feedback notifications cut over from `feedback@lakebridgecap.com` to `no-reply@landadvisors.com` to consolidate into one API key + one verified domain. The `no-reply` prefix avoids needing LAO IT to provision a monitored mailbox.
- **Link-type attachments inline as body text, not server-side fetched.** Most are auth-required Dropbox / SharePoint folder URLs; fetching would 401. File attachments still flow as proper Resend attachments (Buffer from Blob).
- **Sequential per-builder sends, not Resend batch endpoint.** Cleaner error reporting; respects free-tier rate limits naturally.

### Deferred / Pending
- Vercel env var sweep: confirm `RESEND_API_KEY` is the landadvisors key (Chris confirmed it is) and that `EMAIL_FROM` is set to `no-reply@landadvisors.com` in production.
- Per-user `@landadvisors.com` sender addresses — would let the composer offer the signed-in user as a second "From" option.

### Follow-up (same day)
- **BCC the sender on every client-facing send.** Resend doesn't deposit in the sender's Outlook Sent folder, so without this Chris has no mailbox record of platform sends. `sendResolvedEmails` now adds `bcc: email.from.email` (deduped if the sender is already in to/cc). Generalizes to future per-user senders. `SendEmailInput` gained a `bcc` field; not used by the feedback pipeline.

### Blockers
- None.

---

## 2026-05-18 — DD Tracking PDF, brand sweep, blast UX, new consultant roles

Five logical commits, all live on `main` and auto-deploying through Vercel. DB backup branch taken on Neon ahead of the push as a safety precaution since today included an enum migration plus an `apply-renames` rename.

### Done — Due Diligence Tracking PDF replaces Issues Report (`8c6a0bb`)
- Chris's feedback: combine four things into one report sent before each bi-weekly DD call — the 7 milestone dates, issues, deal team, consultants. Drop the open/in-progress/resolved summary stats. Relabel the row from "Issues Tracking Sheet & Send Out before calls" to "Complete Due Diligence".
- New `src/lib/pdf/dd-tracking.tsx` + `src/app/api/deals/[id]/dd-tracking.pdf/route.ts`. Pulls the milestone dates from the Phase 4 checklist items flagged `dateField: true`, joins through `checklist_categories` to scope per deal. Land Advisors branding, inline disposition. The 7 dates are hardcoded as a canonical ordered list in the route so a missing row still renders as "not scheduled".
- `apply-renames` entry carries the row rename across existing deals on next `vercel-build`. `phase-section`'s loose-match recognizes both new and legacy names so deals mid-rename still wire the action buttons.
- Renamed view components: `issues-report-pdf-button` → `dd-tracking-pdf-button`, `issues-row-actions` → `dd-tracking-row-actions`. Email template `ISSUES_REPORT_TEMPLATE` → `DD_TRACKING_TEMPLATE` with updated copy.

### Done — Lakebridge → Land Advisors brand sweep (`f1b84de`)
- Chris noticed Outlook showed "Lakebridge Capital" as the tab name. Renamed everywhere user-facing: root tab title, sign-in subtitle, six sub-page tab titles, root meta description, outbound client-email footer, invite-member modal copy, and the Team-list "Org user" tooltip. Internal admin notification subjects ("[Lakebridge feedback]") and code comments left alone since they're not client-facing.

### Done — Two new consultant roles, Title and Escrow (`5707562`, migration `0028`)
- Append `title` and `escrow` to the `consultant_role` Postgres enum. Display labels: "Title Consultant", "Escrow Consultant". TypeScript `ConsultantRole` union extended (manually maintained; flagged as a future refactor opportunity to derive from the schema).
- Migration uses `ALTER TYPE ADD VALUE` on separate statements as Postgres requires. Runs on next `vercel-build`.

### Done — Email blast modal: single-window flow + per-recipient checkboxes (`c2aa495`)
- Chris's feedback: (1) make recipients individually selectable so the tier + lead filter isn't the only knob, and (2) don't stack modals when going from filter → preview.
- Extracted `EmailPreviewBody` from `EmailPreviewModal` so the preview content can be embedded inside another Dialog. The standalone modal wrapper stays for `DealTeamSendButton`'s single-step case (no regression there).
- `BlastModal` now switches an internal `step` state between filter and preview inside the same Dialog. Step 1's recipient list has a checkbox per emailable contact (defaulted checked), plus a builder-level select-all with an indeterminate state when partially selected. Step 2's footer shows a Back button (with arrow) that returns to Step 1 with filter + checkbox state intact. Send still closes the dialog.

### Done — Team-add Select stays controlled from first render (`75b0a8d`)
- Small fix: pass `null` instead of `undefined` to Base UI's Select for the unset-role case. `undefined` makes the Select uncontrolled, so transitioning to a string value later triggers the controlled/uncontrolled warning.

### Decisions
- **Migrate the row rather than retire it.** Renaming the Phase 4 row in-place via `apply-renames` is cleaner than introducing a parallel "Due Diligence Tracking" row and asking Chris to migrate. The Excel functionality (PDF + Send to Deal Team) stays on the same lifecycle position; only the label and the underlying PDF change.
- **Append enum values rather than reorder.** Postgres allows ADD VALUE BEFORE/AFTER but Drizzle's migrator emits plain appends. Order in the consultant picker is driven by `consultant-roles.ts` (display order), not enum declaration, so the appended `title`/`escrow` slot at the bottom of the picker — fine since they're closing-stage roles.
- **Keep both Cancel and Back semantics distinct.** Cancel discards the whole flow and closes the dialog; Back returns to the previous step preserving state. Step 2 only ever shows Back since you're already past the dismiss-able stage.

### Trade-offs noted for follow-up
- Step 2 subject/body edits get lost on Back since `EmailPreviewBody` unmounts when stepping back. Same as the prior stacked-modal Cancel behavior, so not a regression — but if it bites in practice, the fix is hoisting subject/body state up into `BlastModal` and passing them down as controlled props.
- The `ConsultantRole` TypeScript union is manually maintained alongside the Drizzle enum. Deriving the type from the schema would be a small follow-up that prevents future drift.

### Deferred / Pending
- Real Resend send is still mocked end-to-end pending sender-domain DNS verification (carryover from earlier weeks). No change to the blast or Deal Team send transports today.

---

## 2026-05-07 (afternoon) — Excel-import hardening + checklist notes hidden by default

Two unrelated polish items in the same session.

### Done — Excel importer accepts messier files
- Hardened `src/app/(app)/contacts/import-modal.tsx` so the `Buyers.xlsx` shape Chris sent imports cleanly. Five changes:
  - Header aliases added: `mobile`/`mobilephone`/`cell`/`cellphone`/`workphone` → Phone; `contact` → Name. Fixes Norwalk's "Mobile Phone" column being silently dropped and Lyons's "CONTACT" column not matching anything
  - Header-row autodetection: switched to a 2D-array read and scan the first 10 rows for the one with the most known header keys. Lets us skip a stray title row (Lyons has a `#VALUE!` merged-cell title on row 1 with the real headers on row 2)
  - Sheet picker: when the workbook has more than one sheet, pill buttons appear in the preview to switch sheets. Re-runs parse + auto-detect each time
  - Forward-fill toggle: when a Builder Name column is detected and >=2 rows have empty Builder under a non-empty prior row, the parser suggests forward-fill (default on, user can override). Group-style files where one builder name spans N contacts now work
  - Empty-row filter tightened: drop rows with no name and no email so blank Lyons separator rows don't surface as "Missing first name" errors after forward-fill carries the builder name into them
- Verified end-to-end against `Buyers.xlsx`: Lyons → 14/14 valid (header at row 2, forward-fill auto-applied, separator rows dropped); Norwalk → 79/79 valid (forward-fill correctly NOT suggested, "Mobile Phone" alias picks up phones)

### Done — Checklist notes hidden by default (Chris feedback)
- Chris's 5/7 feedback: "Can you make the notes hidden instead of showing almost as sub bullets?" The 5/7 morning commit (`fbd8baf`) had notes always visible inline beneath the row when content existed
- Replaced `ChecklistNotesAddButton` (only-when-empty text+icon button) with `ChecklistNotesToggle` (always-rendered icon button with a small amber dot when content exists)
- Two-state model in `phase-section.tsx`: `notesOpen` (panel expanded) + `notesEditing` (textarea visible). Click on empty item → opens AND auto-enters edit mode. Click on item with content → opens in view mode. Click again → collapses + clears edit state
- `ChecklistNotesPanel` gains an `onClose` prop. Cancel from an empty draft and Clear of an existing note both call `onClose` so the panel collapses cleanly instead of lingering as an empty stub

### Decisions
- **Always-rendered icon, not "Add" text + chip-on-content.** The icon being permanently in the row gives a stable visual rhythm and lets a glance pick up which items have notes (via the dot) without expanding anything. The earlier text affordance was only there for empty items, then disappeared once content existed — a less consistent shape
- **Separate `notesOpen` and `notesEditing` over one combined state.** The state machine is conceptually 3-state (closed / open-view / open-edit). Keeping editing as a subset of open keeps the panel's existing edit/view internals untouched and makes the transitions easy to reason about

### Notes for future Sean
- Excel importer still ignores the per-deal-tag column pattern (Norwalk's `X` column marking which contacts are buyers on that deal). If we want that, the natural shape is: detect un-mapped columns when the import is launched from a deal page, and offer to mark `X`-flagged rows as buyers on that deal
- Reference memory `reference_vercel_env_cli.md` is now load-bearing for ops scripts. When pulling prod feedback, paste DATABASE_URL inline — never via `vercel env pull` (sensitive vars come back empty + .env.local would override anyway). Burned a couple turns relearning this; re-read memory next time

### Blockers
- None active

---

## 2026-05-07 — Pending: M365 DNS access for Resend domain verification

**TODO when Phase 2 email work starts.** Need DNS-record edit access on `lakebridgecap.com` (M365-managed; nameservers are `ns1-4.bdm.microsoftonline.com`) to set up Resend sender-domain verification.

**Why this is a pending item:** Tried two access paths, both blocked.

1. Chris invited my personal Microsoft account as a guest in his M365 tenant. Microsoft admin center categorically rejects personal MS accounts at sign-in regardless of guest status — error "You can't sign in here with a personal account. Use your work or school account instead." Documented Microsoft limitation; should have flagged up front.

2. Plan B: sign up for free Microsoft 365 Developer Program account → get a real `*.onmicrosoft.com` work account → have Chris re-invite that. Chris is the business owner and a non-technical client who already accommodated one access request that didn't work; a "let's hop on a call so you can run the edits" reframe would push work back onto him after he asked me to handle it.

**Status (2026-05-07 evening):** punted the access decision back to Chris. Tried the M365 Developer Program path on Sean's side — Microsoft tightened signups in late 2024/early 2025 to require an active VS Enterprise subscription or qualifying dev activity, signup got stuck partway through, can't re-attempt for 60 days. Sean emailed Chris asking him to either (a) provision `sean@lakebridgecap.com` (Business Basic, ~$6/mo, creates one offboarding task at handoff) or (b) make the DNS edits himself when the time comes. Awaiting his pick.

**Notes for whichever path Chris picks:**
- If `sean@lakebridgecap.com`: he assigns Domain Name Administrator role, Sean signs into admin.microsoft.com → Settings → Domains → `lakebridgecap.com` → DNS records, adds the Resend TXT/MX/CNAMEs at Resend dashboard's instruction
- If Chris does it himself: Sean prepares a record-by-record list (TXT for SPF/DKIM, possibly MX/CNAME) ahead of time so Chris can paste them in one sitting without back-and-forth
- Either way, defer until Phase 2 email work actually starts — there's nothing time-sensitive about resolving this now

**Lessons logged:**
- Microsoft admin center categorically rejects personal MS accounts as guests, even with full Domain Name Admin role assigned. Should have surfaced this constraint up front instead of waiting for Chris to send an invite that couldn't work
- M365 Developer Program is no longer a viable "spin up a free work account" path; Microsoft Entra free tenant (entra.microsoft.com → Manage tenants → Create) is the actual primitive but Sean didn't reach for it before emailing Chris

---

## 2026-05-06 — Phase 2 kickoff: per-checklist document upload (Vercel Blob, private)

First Phase 2 deliverable lands. Document upload + view + delete is wired into every checklist item, backed by Vercel Blob's private store.

### Done — Schema
- New migration `0004_third_loners.sql`: `documents.checklist_item_id` (uuid, nullable, FK to checklist_items, ON DELETE set null) so we can attach a doc to the item it satisfies. `documents.status` default flipped from "draft" to "final" (Phase 1 didn't surface draft/final UX; defaulting to final keeps the column meaningful for later without forcing every uploader to think about it). `r2_key` column kept under that name — it's the storage column for the blob URL/path; renaming would be cosmetic churn

### Done — Upload + view + delete pipeline
- New `src/lib/documents.ts` server-only helpers: `authorizeDealAccess` (verify deal + item belong to caller's org), `nextVersionFor` (auto-version per (deal, item) pair), `recordUploadedDocument` (writes the row after head() verifies the blob exists in OUR store), `deleteDocumentBlob` (best-effort blob delete + row delete + revalidate)
- New `src/app/api/upload/blob/route.ts`: thin wrapper around `@vercel/blob/client`'s `handleUpload` that issues signed client tokens scoped to a specific deal/item. No `onUploadCompleted` callback — see decision below
- New `src/app/(app)/deals/[id]/document-actions.ts`: `recordUpload` (called from the client after upload() returns; verifies blob exists via head() before writing the row, prevents a malicious caller from registering an arbitrary URL as a "document") and `deleteDocument`
- New `src/app/api/documents/[id]/route.ts`: GET endpoint that authz-checks the doc belongs to the caller's org, then streams the blob through via `get()` with `access: "private"`. Sets correct Content-Type from the recorded MIME and `Content-Disposition: inline` so PDFs render in-tab
- New `src/app/(app)/deals/[id]/views/checklist-document.tsx`: client component that handles the upload state machine. Empty → file picker + Upload button; uploading → progress %; attached → filename chip (links to `/api/documents/[id]`) + replace + delete buttons. Uses `@vercel/blob/client`'s `upload()` for direct browser-to-Vercel-Blob with progress events
- Wired into `phase-section.tsx` to replace the "Upload" PlannedAction placeholder on every checklist item. Latest doc per item is loaded in `page.tsx` (single query, group by item id keeping latest version) and passed through `ChecklistView` → `PhaseSection` → `ChecklistDocument`

### Decisions
- **Private store + stream-through-server downloads** instead of public-with-unguessable-URLs. Sensitive deal docs (OMs, buyer lists, pricing analyses) shouldn't be retrievable just by knowing a URL. Trade-off: every download flows through our Next.js function, costs some compute + bandwidth. At Lakebridge volume (small files, low download frequency) the cost is negligible and we get full audit-trail control
- **Client-driven upload completion** instead of `handleUpload`'s `onUploadCompleted` webhook. The webhook is invoked by Vercel's servers as a POST back to our app, which doesn't work in local dev (Vercel can't reach localhost). Switching to client-side completion (client calls `recordUpload` server action with the pathname after `upload()` returns) works in dev AND prod with one code path. Security comes from server verifying the pathname via `head()` before writing the row — `head()` resolves against OUR store using `BLOB_READ_WRITE_TOKEN`, so a bogus pathname or one in someone else's store throws and the row never lands
- **Inline upload UI per checklist row** (not a modal). Per design discussion: row is the natural unit, modal would be overkill for "upload one file." When attached, the row shows a compact filename chip + replace/delete icons
- **Default status = final, no UI to set draft/final.** Schema retains the column; surfacing it later is a small change. Phase 1 didn't surface this and Chris hasn't asked
- **Versioning at data layer only, no version-history UI.** Each upload bumps `version` and prior blobs stay in storage. UI shows only the latest. If "wait what was in the previous one" comes up, easy to add a small history affordance
- **No file size cap beyond Vercel Blob's defaults.** Direct browser upload bypasses Next.js's 4.5 MB body limit, so OMs in the 10–20 MB range work without timeout issues. Vercel Blob's per-file cap is 5 GB which we'll never approach
- **Allowed content types whitelist** (PDF, Word, Excel, common images, CSV, plain text) at the token-issuance step. Vercel Blob enforces this server-side; tightens vs accepting `*/*`
- **Content-Type header set from `doc.mimeType` recorded at upload time**, not from `get()` response (which doesn't include contentType — only contentDisposition, which is a different thing entirely; bug fixed during initial testing)

### Notes for future Sean
- **Important debugging note:** if uploads fail with a CORS/400 error on `vercel.com/api/blob/`, the most common causes are (1) `BLOB_READ_WRITE_TOKEN` not loaded into the running process (restart dev server after appending), (2) `access` mismatch — store is private, code asks for public (or vice versa) — Vercel returns "Cannot use public access on a private store" from the SDK, (3) `onUploadCompleted` provided when there's no public callback URL (warning in server logs taints the issued token; remove the callback or set `VERCEL_BLOB_CALLBACK_URL`)
- **`r2_key` column name preserved.** It stores the Vercel Blob URL despite the historical name. Future cosmetic rename would touch a lot of files and add no value
- **Excel/image inline preview deferred.** Browsers render PDFs natively but won't preview .xlsx/.docx without a third-party viewer. If Chris asks, we can add a Microsoft Office Online viewer iframe (free, no API key) or fall back to "Download to view" for non-PDF files
- **Version-history UI deferred.** Old blobs remain in storage on replace; cleanup script could prune to keep only last N versions per item if storage costs ever matter (they won't at this scale)
- **Dropbox link integration not yet built.** Per Chris's discovery answers, items can also point at existing Dropbox folders via a manual link. Next sub-task in Phase 2 — separate work from upload

### Blockers
- None active

---

## 2026-05-05 (late) — Vendor swap: Cloudflare R2 → Vercel Blob

Quick re-audit of third-party tooling now that we know the deploy target is Vercel. R2 was chosen pre-Vercel-decision; Vercel Blob is the obvious native swap.

### Done
- CLAUDE.md updated: file storage row in the architecture table (R2 → Vercel Blob with reasoning), Phase 1 setup deliverables, Phase 2 doc-upload bullet, Dropbox-integration implementation note, end-of-Phase-1 vendor-accounts line, vendor ownership table consolidated (now lists Vercel + Resend + Anthropic; "Removed from earlier plans" sub-list documents R2/Clerk/Sentry/standalone-Neon swap-outs)

### Decisions
- **Vercel Blob over Cloudflare R2.** Code wasn't written yet — zero-cost swap. Native to the platform: same dashboard, same billing, signed-URL browser uploads, public CDN URLs. ~$0.17/mo storage at our peak (~7.5 GB; 50 deals × 50 docs × 3 MB avg). Operational simplicity worth more than the rounding-error cost difference vs R2's "free egress" pitch
- **Vendor inventory now: Vercel + Resend + (Anthropic deferred).** Down from the original plan of Vercel + Neon + Cloudflare + Clerk + Resend + Sentry. Lakebridge handoff is a 1–2 vendor situation depending on whether Anthropic gets activated for AI work later

### Notes for future Sean
- No code change needed — `@vercel/blob` SDK gets imported when Phase 2 doc storage starts. Same usage shape (signed URL → upload → blob URL) as any S3-compatible client would have been
- If we ever do hit storage volumes where R2's free-egress matters (>>100 GB or heavy public download patterns), reconsider. Won't happen at brokerage workflow scale

### Blockers
- None active

---

## 2026-05-05 (afternoon/evening) — Builders directory, deal-side contact flows, UX polish, lenient import

Multi-thread session continuing from the morning's standalone Contacts directory. Builders gets the same first-class treatment, the deal-side Contacts tab gets a smarter "Add Existing" flow, and a long string of small UX polishes across the app.

### Done — Standalone Builders directory (`/builders`)
- New top-level route, sidebar nav link "Builders" (sits with Contacts above the owner-only Admin section)
- Server-rendered list table: Name · Classification chip (private/public) · Contacts count · Deals count
- Filter: All / Private / Public (now a dropdown — see UX polish below)
- Search by name / contact-name / deal-name
- Add + edit modal with classification toggle (private/public segmented control) and notes
- Delete is **blocked** when builder is on any deal — confirmation modal lists those deals so the user knows what to clean up first
- Expandable rows show two side-by-side panels: contacts at this builder + deals it's on (deal chips link to `/deals/[id]?tab=contacts`)
- Delete cascades to `set null` on contact.builder_id (configured in earlier schema change), so contacts at a deleted builder orphan rather than disappear

### Done — Deal Contacts tab: combine Add Builder into Add Contact
- Dropped the `+ Add Builder` toolbar button — the AddContactModal now handles inline builder creation through a `+ Create new builder` option in the Builder dropdown. Inline panel reveals a name input + Private/Public segmented toggle when picked
- `addContact` server action now accepts either `builderId` (existing-on-deal) OR `newBuilderName` + `newBuilderClassification`. New-builder path bootstraps the builder + deal_buyer link before inserting the contact
- Deleted dead `add-builder-modal.tsx` (the toolbar's standalone "+ Add Builder" modal) and `prototypes/add-buyer-modal.tsx` (the prototype combined builder/contact creation flow that's now superseded by AddContactModal)
- All four prototypes now match the production tab: `+ Add Contact` instead of `+ Add Buyer`, all using the same AddContactModal so feature parity is automatic

### Done — Deal Contacts tab: smart "Add Existing Contact"
- New `PickExistingContactModal` for adding org-wide contacts to a deal. Two distinct paths inside one modal:
  - **Contact already has a builder** → confirmation summary ("Add Bob to this deal via Lennar (Lennar will be added to the deal too)"). One click. No prompt for assignment.
  - **Standalone contact** → picker (existing deal-builders OR `+ Create new builder` with classification toggle)
- New idempotent `attachBuilderToDeal({ dealId, builderId })` server action — inserts a deal_buyer if the builder isn't already on the deal, no-ops otherwise. Used by the contact-with-builder path to silently bring the contact's company onto the deal
- Available from the production view AND all four prototypes via shared `loadBuyers()` (now also returns `orgContacts: ExistingContactOption[]`)

### Done — UX polish (production + prototypes + directories)
- **Filter chips → single dropdown** on all 6 surfaces: production deal Contacts, 4 prototypes, /contacts, /builders. Trigger reflects the active filter (color dot + label + count + chevron); dropdown shows all options with checkmark on current. Saves ~400px of horizontal real estate, no more wrap collisions
- **Column sorting** added to /contacts (Name · Builder · Title · Email · Phone · Geography) and /builders (Name · Classification · Contacts · Deals). Defaults to Name asc; nulls always sort last; click toggles asc → desc → asc; reuses the same SortHeader pattern from the existing deal Contacts table
- **Builder color chips** in /contacts table — each builder gets a stable pastel color from a 12-color palette (deterministic via UUID hash), so related contacts are visually grouped at a glance. New `src/lib/builder-color.ts` with `builderChipClass(builderId)` for reuse elsewhere later if needed
- **"standalone" label → em dash** in the contact's Builder column (less label noise; same meaning)
- **Building2 icon `flex-shrink-0`** so the icon stays a consistent size when builder names are long (was getting squished by flexbox)
- **Phone normalization** sweep — new `src/lib/phone.ts` with `formatPhone()` (10-digit US → `(XXX) XXX-XXXX`, 11-digit-leading-1 same, anything else returned as-is). Applied at all write sites (`/contacts/actions`, `/deals/[id]/actions` for both contacts and consultants) and all display sites (production view, 4 prototypes, /contacts, consultants list). All phone display cells get `whitespace-nowrap tabular-nums` so numbers never wrap and align cleanly
- **Deal tabs honor `?tab=` query param** — URL is single source of truth, tab clicks call `router.replace` (no history pollution), deep-links from /contacts and /builders directory expand panels land on the right deal tab (Contacts) automatically
- **Removed Excel import placeholder** from the deal Contacts tab — the real importer lives on /contacts now; surfacing the placeholder there too was misleading
- **Deal `revalidatePath` tag** — single helper `revalidateContactSurfaces()` invalidates both `/contacts` and `/deals/[id]` (page) so changes from any direction are immediately reflected

### Done — Lenient Excel importer
- **`Name` column** accepted as alternative to separate `First Name`/`Last Name`. Splits on the LAST whitespace boundary: "Mary Jane Smith" → first="Mary Jane", last="Smith"; "Madonna" → first="Madonna", last="". If a file has both `Name` AND `First Name`/`Last Name`, the split-out columns win
- **`Classification` column** accepted (aliases: `Type`, `Builder Type`, `Company Type`). Values: `public` / `private` / `pub` / `priv` / `publicly traded` / `privately held` (case-insensitive). Only honored when creating a NEW builder — for rows whose builder already exists, classification is read but ignored (no silent mutation of existing builders). Unrecognized values silently fall back to default ("private"); preview shows what classification will be applied next to "+ create XYZ" so typos are visible
- `findOrCreateBuilder` now accepts an optional classification arg (defaults to "private"); piped through from the importer
- `docs/sample-contacts.xlsx` regenerated with 14 rows exercising every code path: standard rows, Name-only rows, classification valid/short/typo, builder match/create, email-dedupe, validation errors

### Decisions
- **Single dropdown over chip row** for filters across the board, even where there are only 3 filter values. Consistency wins; the chip row was a bigger horizontal-space hog than its visual weight justified, and the dropdown trigger styled as the active chip preserves the at-a-glance current state
- **Builder color chips deterministic via UUID hash** rather than per-builder stored color. Two reasons: (1) no schema work, (2) colors stay consistent forever as long as the UUID does. 12-color palette gives enough distinction without collisions at Lakebridge's scale (<200 builders)
- **PickExistingContactModal: no prompt for builder-having contacts** — Chris's call. The mental model is "I want this person on the deal," not "I want this person at THIS specific builder on the deal." If they're already at Lennar, just bring Lennar onto the deal too. One-click instead of prompt-then-confirm
- **Block builder deletion when on any deal** (option A from the design discussion). Cascade-delete or orphan would silently destroy buyer history. Force the user to remove from each deal first; the confirmation modal lists those deals so the cleanup is obvious
- **Combine `+ Add Builder` button into `+ Add Contact`** — reduces toolbar density without losing functionality. The standalone "Add Builder" was a schema-leak (most users want to add a person, builder is incidental)
- **Lenient classification import** (silent fallback for typos) over hard validation. The preview screen surfaces what will actually happen, which is enough; blocking on a typo would force the user to fix the file and re-upload, friction with no upside
- **`Name` parsing splits on LAST whitespace** — handles middle names better than first-whitespace ("Mary Jane Smith" stays correctly bucketed). Single-word names go to first-name, last-name empty. Comma-first format ("Smith, John") is NOT supported — uncommon in real-world contact lists, easy to add later if Chris asks

### Notes for future Sean
- **Migrations now run automatically on Vercel deploy** via the new `vercel-build` script (`drizzle-kit migrate && next build`). Production deploys hit prod Neon; preview deploys hit their own branch DBs (Vercel-Neon integration auto-provisions these). Failed migration → failed build → no deploy lands. No more manual `npm run db:migrate` step
- **First deploy of this batch will apply two migrations to prod:** `0001_loving_archangel.sql` (nullable contacts.builder_id + FK → set null) and `0002_unusual_tempest.sql` (add contacts.geography). Both non-destructive — existing rows keep their builder_id and get NULL for geography
- **Prototype views still loaded with org contacts** even though they're throwaway — adding the `+ Existing Contact` button required it. If we drop prototypes later, also drop `orgContacts` from `loadBuyers()`
- **Deal-tab `?tab=` URL state has implications for the prototype tab strip** — switching to a prototype tab now sets `?tab=proto-a` etc. in the URL. That's fine, but worth knowing if anyone deep-links to a deal expecting Checklist
- **Builder color palette has no contrast guarantees** beyond the chosen Tailwind tints (100 bg / 800 text). All 12 should be readable but if Chris reports any pair as too similar, swap that color in `src/lib/builder-color.ts`
- **Classification import has 4 alias columns** (`Classification`, `Type`, `Builder Type`, `Company Type`). If Chris's marketing list uses something else, easy to add to `HEADER_KEYS` in import-modal.tsx

### Blockers
- None active. Ready to deploy. Migrations run separately as noted above

---

## 2026-05-05 — Standalone Contacts directory + Excel import

Mid-sized refactor in response to Chris flagging that contacts should live independently of any specific builder or deal. Took a planning pass first, then built end-to-end against the local Docker environment so Sean could exercise it as it came together.

### Done — Schema
- `contacts.builder_id` is now nullable (was `notNull`). FK changed from `ON DELETE cascade` to `ON DELETE set null` so deleting a builder orphans rather than destroys its contacts
- New `contacts.geography` text column (nullable) for the geographic-market field Chris asked to capture in the Excel import
- Two clean migrations: `0001_loving_archangel.sql` (nullable builder_id + FK swap) and `0002_unusual_tempest.sql` (add geography). Migration history stays linear from the existing `0000_flawless_masked_marvel.sql` baseline

### Done — Standalone Contacts page (`/contacts`)
- New top-level route, sidebar nav link "Contacts" (visible to all roles, sits above the owner-only Admin section)
- Server-rendered list table: Name · Builder (or "standalone") · Title · Email · Phone · Geography · # of deals their builder is on
- Filter chips: All / With builder / Standalone
- Search box across name / email / builder / title / geography (client-side filter on the loaded list — fine at Lakebridge's expected scale of <500 org contacts)
- Add Contact modal: full form with optional builder picker (existing dropdown + "+ Create new builder" option that calls `findOrCreateBuilder`)
- Edit + delete inline (hover-revealed action buttons; matches existing Contacts tab patterns)
- Server actions: `createContact`, `updateContact`, `deleteContact`, `findOrCreateBuilder`, `importContacts`. Single `revalidateContactSurfaces()` helper invalidates both `/contacts` and the dynamic `/deals/[id]` route so the deal Contacts tab stays fresh

### Done — Excel import
- Installed `xlsx` (sheetjs); parses .xlsx, .xls, and .csv via `XLSX.read` + `sheet_to_json`
- Two-step modal: upload → preview → commit
- Header matching is fuzzy (case-insensitive, strip non-alphanumeric): "First Name", "first_name", "FirstName" all map to the same canonical column. Aliases supported: `Builder Name` ≈ Builder ≈ Company ≈ Company Name; `Geography` ≈ Geo ≈ Market; etc.
- Preview screen shows every row with: row number, parsed name, builder resolution (matched / will-create / none), email, title, geography. Per-row validation errors (missing first name, invalid email format) surfaced inline and excluded from the import count
- Builder name match is case-insensitive against existing org builders. Unmatched names get auto-created (default classification: private). Same name across multiple rows = one new builder created (intra-batch cache)
- Email-based dedupe: existing contact with the same email gets updated rather than duplicated; no email = always insert
- Commit returns `{ contactsCreated, contactsUpdated, buildersCreated, skipped }`; success screen reports each count

### Done — Deal-side "Add Existing Contact"
- New `PickExistingContactModal` on the production deal Contacts view. Sits next to "+ Add Builder" and "+ Add Contact" as a third action button labeled "+ Existing Contact"
- Search across name / email / builder / title; candidates are filtered to contacts NOT already at one of the deal's builders (those already show up in the table — surfacing them again is confusing)
- After picking, requires choosing a builder on the deal as the assignment target. Reuses the standalone `updateContact` action — picking moves the contact's builder_id, which then surfaces them in the deal Contacts tab via the existing JOIN
- Warning shown when picking a contact already at a different builder, since this moves them rather than creating a duplicate
- The four prototype Contacts views were intentionally NOT updated — they're throwaway alternatives Chris is reviewing for layout, not features. Adding the new flow to all 5 places would balloon the diff for no design value

### Decisions
- **Nullable builder_id over a separate contact-builder join table.** Chris's stated need is "contacts can exist without a builder, then get a builder later." A 1:N (builder has many contacts, contact has zero or one builder) model fits that exactly. A many-to-many `contact_builders` join table would handle "Bob worked at Lennar 2020-2023, KB 2023-now" but that's a different feature (employment history) Chris hasn't asked for
- **`ON DELETE set null` on the FK.** Deleting a builder shouldn't destroy the people we know about. Orphaned contacts can be re-assigned to a new builder later or stay as standalone records
- **Auto-create unmatched builders during import** with classification = private as the default. Alternative was to skip those rows and require pre-creating builders manually, but Chris's import workflow assumes the marketing list IS the source of truth — forcing a manual builder-creation pre-step would defeat the point of bulk import. The preview screen surfaces what will be created so it's still visible
- **Email-based dedupe over name+builder.** Email is the strongest unique signal in real-world contact lists; same name at the same builder could be junior vs senior people, but the same email is almost always the same person
- **Excel parsing client-side, commit server-side.** Parsing in the browser (via xlsx) keeps the file off our servers and gives instant feedback; only the validated row payload goes to the server action for the commit. Cleaner separation, smaller server payload
- **Reuse `updateContact` for the deal-side pick-existing flow** rather than introducing a new `assignContactToBuilder` action. Setting `builderId` on update is exactly what we want; a dedicated assign action would just be a partial wrapper
- **Skipped reseeding the prod Neon DB** for this batch (per recent feedback). Local Docker DB validates the migrations + flows; prod gets the schema migrations on the next deploy via `db:migrate`, and existing prod contact data carries over with no transformation needed (dropping `notNull` is non-destructive)

### Notes for future Sean
- New `xlsx` dep is well-known but pulls in a CVE per `npm install` warning. It's only used in the browser for parsing; not invoked server-side. If we ever want to parse server-side too (e.g. for an email-attachment ingest), revisit whether to swap for `read-excel-file` or similar
- The deal-side pick-existing modal currently calls `updateContact` from `/contacts/actions`. Cross-route action import works fine but is a slight architecture smell — if `/contacts/actions` ever picks up auth-gating or extra side effects, the deal page inherits them. Worth refactoring to a shared `lib/contact-actions.ts` if it grows
- Standalone contacts have `builder_id = NULL`. The deal Contacts tab's JOIN currently does `dealBuyers.builderId = builders.id` then `LEFT JOIN contacts on contacts.builderId = builders.id` — standalone contacts never appear because they have no builder. That's the intended behavior, but worth remembering when debugging "why isn't contact X showing up on this deal?"
- Migration `0002_unusual_tempest.sql` adds `geography` as a fresh column with no backfill — existing contacts will have `NULL` until edited or re-imported. Fine for now; if Chris wants a "geography known" indicator on the org contacts list, that's a future tweak

### Blockers
- None active. Refactor functionally complete and locally validated. Will deploy on next push to main; existing prod data carries over cleanly (no destructive schema changes)

---

## 2026-05-04 — Production polish + auto-checklist on deal create

Post-deploy fix-up session. Three threads stacked tightly together: deploy speed, ops UX, and a real bug (new deals shipped with empty checklists).

### Done — Deploy speed (snappier deal navigation)
- `vercel.json` locks function region to `pdx1` (Portland) — same datacenter region as Neon's `us-west-2`. Drops cross-region query RTT from ~70ms to ~5ms. Single biggest perceived-speed win
- Deal page's 7 sequential DB queries (deal, categories, items, contacts/qa/issues/consultants counts) batched into one `Promise.all`. Total latency = max(query) instead of sum(query)
- `getCurrentUser` + `getCurrentOrg` wrapped in React's `cache()` so the page + sidebar + any other resolver in the same request share one Better Auth session lookup and one DB read
- Verified post-deploy: cold hit ~1.1s (function spin + Neon wake), warm hit ~290ms

### Done — Feedback report ergonomics
- `src/scripts/feedback-report.ts` no longer imports `@/db` (which transitively required every prod env var via `@/lib/env`). Constructs its own thin Drizzle client from `process.env.DATABASE_URL` directly
- One-liner against any Postgres now works: `DATABASE_URL=postgres://... npm run feedback:report`. No more juggling stub auth/Resend env vars to look at prod feedback

### Done — Auto-populate checklist on deal create
- **Real bug:** `createDeal` only inserted the deal row — no checklist categories or items. Newly created deals showed an empty Checklist tab even though seeded deals had the full 4-phase tree
- Extracted the canonical 4-phase / 11-category / ~37-item template from `seed.ts` into a new `src/db/checklist-template.ts` module. Source of truth — both seed and createDeal import from there so the two can never drift again
- `seedChecklistForDeal(client, { orgId, dealId })` exposes the insert work as a function. createDeal calls it after the deal insert; the seed loops over both demo deals and calls it
- Note in code: Neon HTTP driver doesn't support transactions, so deal-then-checklist isn't atomic. If checklist insert fails, the orphan deal needs manual cleanup. Acceptable trade-off for a fully-static template; revisit if it ever fails in practice

### Decisions
- **Deploy to `pdx1` co-located with Neon** instead of staying on `iad1` and reaching across the country. The Vercel/Neon round-trip is the dominant page-load cost on a server-rendered app like this — no clever caching beats just sitting next to the DB
- **`cache()` over manual deduplication.** React's request-scoped cache is exactly the right tool — automatic, no leak risk across requests, transparent to callers. Better than passing `org`/`user` as props down the tree
- **Single template module over duplicating the spec in seed + create.** The two were 100 lines of inline data each. One source, two callers, zero drift risk
- **Decoupled feedback-report from `@/lib/env`** rather than adding a "report-only" relaxed env schema. The script genuinely needs only DATABASE_URL — making it explicit is better than carrying validation noise. Same approach should apply to any future ops scripts (db:studio, future migration helpers)

### Notes for future Sean
- **Don't re-seed production Neon casually.** Truncating organizations cascades to feedback_items, killing any test feedback users have left. Truncating auth tables invalidates every live session, bouncing users to /sign-in. During this session I re-seeded a couple times to validate refactors — should have used targeted SELECT queries instead. Treat seed as "fresh-bootstrap only" once the DB has any user-generated data
- Vercel's CLI quirk where `vercel env add NAME preview` insists on a git-branch arg even when the docs say omit-for-all — still unresolved. Set BETTER_AUTH_SECRET on preview via the dashboard if/when first PR creates a preview deploy
- Neon free tier auto-suspends after 5 min idle. First click after a coffee break will always have a 1–1.5s hitch. Only fix is upgrading to Launch ($19/mo); not worth it for a Phase 1 demo

### Blockers
- None active. Production deploy is live, snappy, and creates correct checklists. Phase 2 still gated on Lakebridge's vendor accounts (Vercel team transfer, R2, Resend)

---

## 2026-05-01 (evening) — First Vercel deploy attempt + Neon integration + migration drift cleanup

Got Sean-owned Vercel project up, integrated Neon via the Vercel marketplace, hit a real schema-drift bug in the process, and cleaned it up. Production deploy unblocked.

### Done — Vercel project + Neon integration
- Vercel CLI installed; project linked (`smatsutsuyus-projects/brokerage-process`). `.vercel/` auto-gitignored
- Added Neon via Vercel's marketplace integration (Sean's account for now — handoff-clean because Lakebridge's Vercel team will own the Neon project once the Vercel team transfers)
- Discovered Vercel marks integration-set env vars as **Sensitive** — values are encrypted server-side and cannot be retrieved via the CLI or UI even by the project owner. `vercel env pull` returns empty strings for these. The only way to get the actual `DATABASE_URL` is via the Neon dashboard
- All four required env vars set on production: `DATABASE_URL` (from integration), `BETTER_AUTH_SECRET` (random 32-byte base64), `BETTER_AUTH_URL` (`https://brokerage-process-smatsutsuyus-projects.vercel.app`), `RESEND_API_KEY` (placeholder — no Phase 1 code calls Resend, will be replaced in Phase 2)

### Done — Migration drift cleanup
**The bug:** `src/db/schema/auth.ts` (Better Auth tables) was added during the 2026-05-01 morning Clerk-to-Better-Auth swap, plus the `users` table was reshaped during the Option-A consolidation (dropped clerk_user_id/email/firstName/lastName, added authUserId/disabledAt). All those changes were synced to local DB via `db:push` — neither got captured in a migration file. Result: the two checked-in migrations (`0000_modern_dorian_gray`, `0001_dizzy_wind_dancer`) describe an obsolete schema that doesn't include auth tables and still has the old user columns. Running `npm run db:migrate` against fresh Neon produced a working but stale schema; seed then crashed with "relation auth_session does not exist."

**The fix:**
- Deleted both old migration files + their meta snapshots; reset `_journal.json` to empty entries
- Ran `npm run db:generate` against the current schema → produced a single clean `0000_flawless_masked_marvel.sql` capturing every table including the auth ones
- Dropped `public` + `drizzle` schemas on Neon, ran `npm run db:migrate` against the empty DB → applied cleanly, populated `drizzle.__drizzle_migrations` tracking table (verified: 1 row, hash matches the new file)
- Re-seeded sample data — 1 org, 2 users (Sean + Chris), 2 deals, full hierarchical checklist, sample Q&A/issues/consultants

### Decisions
- **Neon via Vercel integration over direct Neon account.** The integration auto-creates a Neon project tied to the Vercel team, injects DATABASE_URL into all envs automatically, and gives every preview deploy its own DB branch. Single billing relationship through Vercel. Handoff intent preserved because the Neon project belongs to whichever Vercel team owns the project — when Lakebridge takes over the Vercel team, Neon goes with it
- **Reset migrations to a single 0000 instead of writing a 0002 fixup.** The two old migrations described a schema that never made it past local — no production deploy had ever run them, so collapsing the history was strictly cleaner than carrying obsolete intermediate states. Migrations from this point forward are the source of truth; no more `db:push` against environments that will be migrated
- **Placeholder RESEND_API_KEY** so env validation passes during build. No Phase 1 code calls Resend; first real key happens when Lakebridge provisions the Resend account in Phase 2
- **BETTER_AUTH_URL points at Vercel's auto-domain for now.** Will switch to `https://brokerage.lakebridgecap.com` once the subdomain is wired up in DNS — Better Auth keys session cookies and OAuth callbacks off this value, so it has to match the actual hostname users hit

### Notes for future Sean
- **`db:push` is now off-limits for any environment that runs `db:migrate`** (i.e. production, and any preview deploy created via Vercel). Local Docker DB still fine to push to during exploration, but generate a migration before merging schema changes
- **Vercel's "Sensitive" env var feature is one-way.** If you ever need to read a Sensitive var's value (e.g. to debug a connection issue from outside Vercel's runtime), the only path is through the source service (Neon dashboard for DATABASE_URL, etc.) — there's no decrypt
- **Preview env BETTER_AUTH_SECRET still missing.** CLI quirk where `vercel env add ... preview` insists on a git-branch arg even when the docs say omit-for-all-branches. Set via dashboard or revisit when first PR creates a preview deploy
- **`RESEND_API_KEY=re_placeholder_phase1` is currently committed in env validation but not actually used at runtime.** When Phase 2 wires up email, double-check no code path silently fails open against the placeholder

### Blockers
- None active. Production deploy ready to retry. Phase 2 still gated on Lakebridge's vendor accounts (Vercel team transfer, R2, Resend)

---

## 2026-05-01 (afternoon) — Contacts prototypes, planned-action placeholders, layout polish

End-of-Phase-1 polish session. Two threads of work: (1) explore the Contacts UX with four parallel design proposals so Chris can pick a direction at next call, (2) flesh out the rest of the deal page with placeholder buttons for every Phase 2 feature so Chris can sign off on the design before any of it is built.

### Done — Contacts UX prototypes (4 alternative tabs)
- Pain points identified: two separate "Add Builder" / "Add Contact" buttons (schema leaking into UX), empty-row ghosts when a builder has no contacts, builder name repeating per contact, 13 columns forcing horizontal scroll, workflow is company-first but the table is contact-first
- Built four alternative views as parallel tabs alongside the production Contacts tab — visible only when on Contacts or a prototype tab via an amber dashed strip:
  - **A · Cards** — collapsible builder cards with contacts indented inside
  - **B · Pane** — master/detail (builder list left, selected builder's detail right)
  - **C · Grouped** — table with builder header rows spanning all columns, contacts indented underneath
  - **D · Compact** — Linear-style dense rows, click to expand
- All four share a single `loadBuyers()` query that returns nested `BuyerGroup → contacts[]` shape; no duplicate JOINs
- Built combined `<AddBuyerModal>` for the prototypes — pick builder + optional first contact in one step (collapses the two-button workflow)
- Required schema-shape change: `addBuilderToDeal` now returns `{ builderId, dealBuyerId }` so the combined modal can chain a contact insert without a server round-trip lookup
- All four reuse existing `TierBadge`, `BuyerCheckbox`, `LeadPicker`, `AddContactModal` so live tier/lead/checkbox interactions work in every prototype
- Filter chips changed from color names ("Green", "Yellow", "Red") to the descriptive labels they map to ("Interested", "Evaluating", "Immediate Pass") — applied across all four prototypes AND the production Contacts table for consistency
- Wrapped the prototype switcher strip in a `FeedbackZone section="contacts-prototypes"` so Chris can leave focused notes on the prototype comparison

### Done — Planned-action placeholders for design sign-off
Goal: give Chris a clickable surface area that reflects every Phase 2 feature so he can sign off on the design before any of it is built.

- New `<PlannedAction>` component: button styled with dashed outline + amber hover, triggers a Sonner toast on click describing the future feature and which phase it lands in. Standalone `toastComingSoon()` helper for non-button surfaces (dropdown items)
- Mounted Sonner `<Toaster>` (bottom-right) in the `(app)` layout
- **Per-checklist-item placeholders** — `planned-item-actions.ts` maps checklist item names → item-specific actions (e.g. "Send out OM/Blast" → ✉️ Send to buyers, "CFD Analysis" → 📄 Generate PDF, "Send out Q&A File" → 📄 Generate Q&A PDF + ✉️ Send). Plus universal **Upload** + **Link Dropbox** affordances on every row
- **Q&A header buttons** — replaced the inert disabled "Generate PDF" / "Send email" buttons with live placeholders: Generate PDF, Distribute to buyers, Email selected buyers
- **Contacts + 4 prototypes header** — added Send OM blast, Send follow-up, Import from Excel alongside + Add Buyer
- **Issues header** — Export to Excel
- **Consultants header** — Email roster
- **Deal `⋯` menu** — new "Planned actions" section at the top: Generate Marketing Report, Compile offer package, Email status to Owner Team (above Edit/Delete)
- Per-row actions on checklist items started as hover-reveal but switched to always-visible after Chris noted floaty appearance (same pattern fix as previous session)

### Done — Polish based on Chris's testing
- Toast description text darkened (was using Sonner's muted-foreground default which was too faint); phase tag bumped to bolder amber-700/semibold
- New `align="far"` option on `FeedbackZone` (`-top-3 -right-5`) for cases where the corner is occupied by another control like a dropdown trigger — applied to deal-header so the bubble doesn't overlap the `⋯` menu. Initial value `-right-10` was too aggressive; pulled back per Chris's feedback
- Q&A's `max-w-[800px]` constraint removed so all five tabs share the same horizontal footprint (no width-snap when switching tabs)
- Main column padding tuned through three iterations: `px-10` → `px-6` → `px-8` per Chris
- Added `[scrollbar-gutter:stable]` to all main columns so tabs that overflow vertically don't shift content sideways relative to tabs that fit on one screen
- Feedback submission copy made more professional: confirmation now reads "Your feedback has been recorded." / "Thanks for taking the time." (was "Thanks — got it."); modal description no longer name-drops Sean

### Decisions
- **Auth/session lifetime documented:** Better Auth sessions live 7 days with sliding refresh on requests >1 day old. Active users effectively never get bounced; idle users are signed out at 7 days. No idle timeout, no absolute max — both are config-only changes if Chris wants stricter behavior later
- **Prototype tabs treated as throwaway exploration**, not real features. Visually offset from the production tab nav (amber dashed strip with "FlaskConical" icon) so reviewers know they're alternatives, not new functionality
- **Per-tab placeholder buttons over a separate "what's coming" doc.** Letting Chris see *where* each future affordance lives in the UI is more informative than a flat checklist of upcoming features
- **Each placeholder names its concrete future feature** in the toast (not just "coming soon") so Chris can mentally validate the design against actual deliverables. Phase tag separates Phase 2 (document/email automation) from Phase 3 (polish/handoff) from "future engagement" (AI work)

### Notes for future Sean
- The `addBuilderToDeal` action now returns the new IDs — keep that contract if/when we wire up the production Contacts view to use the combined Add Buyer modal
- `planned-item-actions.ts` matches by lowercased exact name. If we ever add new checklist items via UI (vs. seed), this mapping won't auto-update — items without a match just get the universal Upload + Link affordances, which is acceptable
- Sonner toasts honor description as a React node — if we want richer "coming soon" content in future, the slot is already there
- Prototype views use `useState`-based filtering and grouping; if the buyer list grows past ~50 they'd benefit from URL-state and virtualization, but that's beyond Phase 1

### Blockers
- None. Phase 1 functionally complete. Awaiting Lakebridge vendor accounts (Vercel, Neon, R2, Resend) to begin Phase 2 deployment + document/email work

---

## 2026-05-01 — Profile page, schema cleanup, layout polish, and a sneaky BaseUI bug

Big batch of cleanups and polish after the auth swap. Lots of small things that compound.

### Done — Profile page + UserLink replacing UserMenu
- New `/profile` page: edit name (single field, written to `auth_user.name`), change password (Better Auth's `changePassword` API with current/new/confirm validation), sign out
- Sidebar bottom-left user element is now a clickable Link to `/profile` (replaces the old dropdown). Active-route highlight when on /profile.
- `user-menu.tsx` deleted in favor of `user-link.tsx`
- Sign out moved to a dedicated section on the profile page

### Done — Sidebar Admin section + active-route highlight
- New `<SidebarNavLink>` client component reads `usePathname()` and applies blue border + tint when active (same treatment as active deal cards)
- Members link gets a visible "ADMIN → Members" section in the sidebar (above the user link), owner-gated
- No more digging through dropdowns to find admin

### Done — Stale-cookie recovery
- `/sign-in` redirects to `/` when already authed
- `/` and `/deals/[id]` redirect to `/sign-in` when `getCurrentUser()` returns null (cookie present but session invalid — e.g., DB wiped while browser was open, secret rotated, member disabled)

### Done — Users table consolidation (Option A)
After a design conversation about whether the two-table user model (auth_user + users) was earning its complexity for our scale, dropped duplication. Schema now keeps each fact in one place:
- `users` table: just (id, orgId, authUserId, role, disabledAt, timestamps) — six fields. Dropped `email`, `firstName`, `lastName`.
- Identity fields (name, email) read from `auth_user` via JOIN
- `getCurrentUser()` does the JOIN once and returns a flat `CurrentUser` shape — every consumer downstream is unaware of the two-table layout
- Profile name edit writes to `auth_user.name` only — no sync needed
- Members list, invite modal, issues view, contacts view all updated to JOIN through `users → auth_user`

### Done — middleware → proxy rename
- Next.js 16 deprecated the `middleware` file convention in favor of `proxy`. Renamed `src/middleware.ts → src/proxy.ts` and the function `middleware → proxy`. Identical behavior, deprecation warning gone.

### Done — Deal model trimming
- **Priority** simplified from `low/medium/high` to `normal/high` (prototype's two-state model). Schema enum, modal options, type definitions all aligned.
- **Status/phase field dropped from deals entirely.** Was a separate enum carried on the deal row; never matched the prototype which only modeled name/location/priority. Workflow phase is implicit in the checklist now.
- **Sidebar phase chip** computed at query time: per-phase incomplete-required-item counts, lowest phase with any remaining required items wins. "Complete" chip when everything's done. Colors mirror the phase header colors in the checklist view.

### Done — Checklist phases are collapsible
- Phase headers are clickable buttons that toggle expand/collapse
- Auto-collapsed on mount when every item in the phase is complete (frees screen real estate for in-progress phases)
- Manual toggle thereafter — completing the last item mid-session doesn't auto-collapse out from under the user

### Done — Profile page polish + sign-in subtitle restored
- Removed redundant subtext from Email and Role fields on profile (the user can read; no need to over-explain)
- Sign-in page subtitle ("Lakebridge Capital deal lifecycle platform") restored

### Done — Layout / scrollbar fix
- Body was `min-h-full` (≥ viewport, can grow). Any sub-pixel rounding or negative-margin element triggered a page-level scrollbar.
- Changed to `h-full overflow-hidden`. Body locked to exactly the viewport. Internal scroll containers (sidebar nav, main, modals) handle their own overflow within bounds.

### Bug — BaseUI `Menu.Item` uses `onClick`, not `onSelect`
The big one. Six DropdownMenuItem usages were silently no-ops:
- Sign out
- Members link in user dropdown
- Change member role
- Change buyer tier (TierBadge)
- Change issue status (IssueStatusBadge)
- Lead reassignment (LeadPicker)
- Deal Edit / Delete (DealMenu)

shadcn's DropdownMenuItem wraps BaseUI's `MenuPrimitive.Item`, which exposes `onClick` (not `onSelect` like Radix does). My `onSelect={...}` props were spread to the underlying `<div>`, which has no native `onSelect` event, and silently disappeared. Fix: `sed -i 's/onSelect=/onClick=/g'` across all six files.

**Lesson for the file:** when shadcn switched its base library from Radix to BaseUI (`base-nova` preset), prop signatures shifted in subtle ways. Two known gotchas now:
1. `<SelectValue>` doesn't auto-derive from selected SelectItem children — must pass display label explicitly
2. `<DropdownMenuItem>` uses `onClick` not `onSelect`

Worth checking other primitives if anything similar comes up.

### Bug — Stale dev server on port 3000 masking middleware
Spent a frustrating hour chasing a "middleware not running" ghost. Cause: a stale `next dev` process bound to port 3000 from before the auth swap. New `npm run dev` started on 3001 and my browser was hitting the old 3000 server. Detection: the "Port 3000 in use, using 3001 instead" log line. Resolution: `taskkill /PID <PID> /F`. Documented in `docs/local-development.md` troubleshooting section.

### Bug — Middleware location requires `src/`
When the project uses the `src/` directory layout, `middleware.ts` (now `proxy.ts`) must be at `src/proxy.ts`, NOT at the project root. Originally placed at root and ignored. Documented.

### Blockers
- None.

---

## 2026-05-01 — Vendor reduction: dropped Clerk + Sentry, added Better Auth

After discussion with the user about vendor count for an internal tool: Lakebridge will manage 5 vendor accounts instead of 7. Per-vendor cost (account, dashboard learning curve, billing surprises, security boundaries) compounds; for 5-10 users at this scale, Clerk's value-add (orgs primitive, drop-in UI) is mostly build-time win for me, not ops win for Lakebridge.

### Done — Sentry removed
- Uninstalled `@sentry/nextjs`. No config files were ever added (only the package).
- Updated CLAUDE.md stack table — error visibility now relies on Vercel function logs, which are sufficient at this scale.

### Done — Clerk → Better Auth swap
- Uninstalled `@clerk/nextjs`. Removed ClerkProvider TODO from root layout (was never wired anyway).
- Installed `better-auth`. Configured with email/password, Drizzle adapter pointing at our Postgres, 7-day session, `nextCookies()` plugin for Server Action support.
- New auth schema (`src/db/schema/auth.ts`): `auth_user`, `auth_session`, `auth_account`, `auth_verification`. All tables prefixed `auth_*` to keep them visually grouped and avoid collision with our `users` table.
- `users.clerk_user_id` renamed to `users.auth_user_id` (text, unique, **nullable** — owner can pre-create a membership row before invitee first signs in).
- Added `users.disabled_at` for soft account disable (separate from delete; preserves historical FK references).
- New API route handler at `/api/auth/[...all]/route.ts` (Better Auth's catch-all).
- New middleware at `src/middleware.ts` (must be in src/, not root, when using src directory). Cookie presence check redirects unauthenticated users to `/sign-in?from=<path>`. Allows `/sign-in` and `/api/auth/*` through.
- New `/sign-in` page with email/password form via `signIn.email()`.
- `getCurrentUser()` and `getCurrentOrg()` rewritten to read Better Auth session via `auth.api.getSession({ headers })`. Sidebar, deal pages, contacts view, etc. all use these — no callsite changes.
- Sidebar footer now shows current user with a dropdown for sign out + (owner-only) Members link.
- New `/admin/members` page (owner-only, `dynamic = "force-dynamic"`):
  - List of all org members with role, status (active/disabled), "You" badge for the current user
  - "Invite member" modal: name, email, role, auto-generated initial password (regenerable). On success, shows credentials for the owner to share out-of-band.
  - Inline role change via dropdown
  - Disable / re-enable toggle (with confirm dialog for disable)
  - Owner can't change their own role or disable their own account
- Seed updated: creates Chris's Better Auth account using `auth.api.signUpEmail()` (so the password gets hashed correctly), then inserts the matching `users` row with `authUserId` linked. Dev credentials: `cshiota@lakebridgecap.com` / `lakebridge-dev-password`.

### Decisions
- **Better Auth (self-hosted) over WorkOS / Auth0 / Auth.js / roll-your-own.** Modern TypeScript-first DX, runs entirely on our Postgres, supports the primitives we need (email/password, sessions, OAuth-ready for Google later), no vendor lock-in.
- **`auth_*` table naming** rather than letting Better Auth use `user`/`session`/etc. (which would collide with our existing `users` table). Required schema customization passed to drizzleAdapter.
- **Auth user separate from app user.** Same pattern we had with Clerk — Better Auth manages identity (auth_user); our `users` table handles org membership + role. They join via `auth_user_id`.
- **Invite-only with owner-issued initial passwords**, not open sign-up. The /sign-up UI doesn't exist; owner uses /admin/members to add people. **Caveat:** the `/api/auth/sign-up/email` endpoint is technically still reachable (we couldn't use Better Auth's `disableSignUp: true` because it blocks our own server-side seed/invite calls). **TODO before production launch:** add Better Auth's admin plugin OR a server-side guard that rejects sign-up requests not originating from the members admin page. Tracked here.
- **Soft disable, not hard delete** for member deactivation. Preserves all the FK references (lead_user_id, completed_by, approved_by, etc.) which would otherwise null out and lose audit-relevant attribution.
- **Middleware does cookie-presence check only**, not full session validation. Validation happens in server code via `auth.api.getSession()`. Faster middleware, single source of truth for "what does signed-in mean."
- **Schema sync via `db:push --force`** rather than generating a clean migration. The `clerkUserId → authUserId` rename triggers an interactive prompt drizzle-kit can't satisfy in non-TTY shells. Migration history can be squashed before production cutover.

### Notes for next steps
- Wire Google OAuth in Better Auth (single config addition + GOOGLE_CLIENT_ID/SECRET env vars). Punted because Lakebridge can decide later whether Google is required or email/password is enough.
- Add a `/profile` page so users can change their own password (currently only achievable via SQL).
- Harden the open `/api/auth/sign-up/email` endpoint before going live (see Decisions).
- Audit log entries for member changes (role / disable). Schema supports it; not yet wired.

### Bug fix discovered along the way
- Stale dev server on port 3000 was serving compiled-out-of-date code, which had me chasing a ghost in middleware redirect logic. Killed via `taskkill /PID /F`. Worth knowing for future hot-reload weirdness — when localhost behavior doesn't match the source, check `ss -lntp | grep :3000` for an orphan.
- Middleware must be at `src/middleware.ts` when using the `src/` directory layout, not project root. Originally placed at root; moved.

### Blockers
- None. Auth is enforced; Lakebridge can't go live until they have at least one Lakebridge-domain admin account, but locally we're fully functional.

---

## 2026-05-01 — Phase 1 boundary: Consultants + Deal CRUD + Lead picker

Three chunks shipped together — all five deal tabs are now functional, the sidebar can create deals, and the deal header has full lifecycle management. **Phase 1 is complete from a workflow-functionality standpoint.** Remaining Phase 1 work is polish + handoff prep; Phase 2 (document upload, document generation, email send) starts here.

### Done — Chunk 1: Consultants tab
- New server actions `addConsultant`, `updateConsultant`, `deleteConsultant`
- `consultants-view.tsx` — server component fetching all consultants for the deal, ordered by role/side/firm
- `consultants-list.tsx` — grid of 11 cards (one per CLAUDE.md role: landscape architect, civil engineer, soils engineer, cost-to-complete, HOA, dry utility, Phase I environmental, land use, biologist, architect, PSA attorney). Each card lists 0+ consultants assigned to that role.
- Each consultant entry shows side badge (Buyer/Seller), firm name, contact name, email, phone, notes; edit + remove icons hover-revealed per entry; "+ add" affordance per role card
- `consultant-modal.tsx` — add/edit form: role (preselected when adding from a card), side, firm, contact, email, phone, notes
- "X of 11 roles filled" summary in the toolbar
- Removed the now-unused `ComingSoon` placeholder from the deal page

### Done — Chunk 2: Deal CRUD
- New server actions in `src/app/(app)/deals/actions.ts`: `createDeal`, `updateDeal`, `deleteDeal` (delete redirects to `/`)
- `deal-modal.tsx` — add/edit form with name, units, city, state, type (free text), phase/status, priority, notes; create flow auto-navigates to the new deal
- `new-deal-button.tsx` — small client component wrapping the sidebar's "+ New Deal" button + modal trigger; replaces the previously disabled placeholder
- `deal-menu.tsx` — three-dot dropdown in the deal header with **Edit deal** (opens DealModal in edit mode) and **Delete deal** (confirms via `useConfirm`, then deletes + redirects)
- DealHeader updated to receive the `deal` prop and render the menu in the top-right of the title row

### Done — Chunk 3: Lead user reassignment in Contacts
- New server action `setBuyerLead` (sets `deal_buyers.lead_user_id`, supports null for unassigned)
- `lead-picker.tsx` — dropdown showing org users + "Unassigned"; same pattern as TierBadge
- Lead column in the contacts table replaced its plain-text display with the picker; reassign tier/lead inline without opening a modal
- ContactsView now fetches the org user list (LEFT JOIN-style) and passes options through

### Decisions
- **Consultants are one-card-per-role** matching the prototype, but each card holds a list of consultants (not a single one). Aligns the schema's flexibility (multiple firms/sides per role) with the prototype's familiar visual.
- **Deal page menu lives in the header**, not in the sidebar. Sidebar is for navigation; header is for the active context.
- **Deal delete redirects to `/`** because the deleted deal's URL is now invalid. Done in the server action via `next/navigation`'s `redirect`.
- **Lead picker dropdown is plain text** (not a colored badge) — leads aren't categorical; they're identity. Distinguishes visually from TierBadge.
- **No bulk operations on consultants yet** (e.g., copy roster from a previous deal). Out of scope for Phase 1; revisit if Chris finds himself manually re-entering the same firms across deals.

### Where we are
**All five tabs functional:**
- Checklist (interactive across 4 phases)
- Contacts (sortable, multi-contact builders, tier change inline, called/OM toggles, add/edit/delete contact, add builder, lead reassignment inline)
- Q&A (locked-by-default with Edit/Save/Cancel, approve/unapprove, approve all, delete, with PDF + email placeholders for Phase 2)
- Issues (cards with status-colored borders, status change inline, add/edit/delete, assignee picker)
- Consultants (11 role cards, add/edit/remove per consultant, Buyer/Seller side badges)

**Deal management:**
- Create deals from sidebar
- Edit deal info from deal header
- Delete deal (with redirect)
- Sidebar shows deals with progress bars and priority indicators

**In-app feedback widget** wired across 9 zones, `npm run feedback:report` for triage.

### Notes for next steps (Phase 2)
- Document upload (R2 storage)
- Document viewer (PDF inline, Excel preview, image preview)
- Document versioning (auto on save)
- Templated outputs: Q&A File PDF (currently placeholder button), Marketing Report, Custom UW File
- Resend email pipeline: sender domain verification, templated composition, in-platform review, send tracking
- Land Advisors branding on generated PDFs

### Blockers
- None for Phase 1. Phase 2 needs Cloudflare R2 account + Resend account from Lakebridge.

---

## 2026-05-01 — Week 2 push: Contacts CRUD complete + Q&A + Issues + polish

Three logical chunks landed in one session, all reachable from the deal page.

### Done — Chunk 1: Contacts CRUD complete
- **Edit Contact** — pencil icon in actions column → modal pre-filled with current values; reuses `AddContactModal` in edit mode (builder picker disabled, can't reassign builder via this flow). Server action `updateContact`.
- **Delete Contact** — trash icon → small confirm dialog (`DeleteContactDialog`). Server action `deleteContact`.
- **Add Builder modal** — new "+ Add Builder" button next to "+ Add Contact". Form: name, type (Private/Public), interest level (with descriptive labels), notes. Server action `addBuilderToDeal` runs in a single transaction (insert builder + insert deal_buyer atomically).
- Edit/delete icons live in the actions column at low opacity, intensify on row hover.
- Sortable columns narrowed to where it makes sense: Interest, Builder, Contact, Type, Lead, Called, OM. Removed sort from Title/Email/Phone/Comments (free-text sort isn't useful).
- **Contact column sorts by last name**, then first name as tiebreaker — standard for people lists.
- **Interest chip text changed** from color names ("Green") to descriptive meaning ("Interested" / "Evaluating" / "Immediate Pass" / "Not Selected"). The color already conveys the tier; doubling up was redundant. Dropdown options keep the "Green — Interested" form for full clarity when picking.

### Done — Chunk 2: Q&A workflow tab
- `qa-view.tsx` — server, fetches qa_items for the deal, ordered by created_at
- `qa-list.tsx` — client; toolbar shows approved/pending counts + "Approve all", "Generate PDF" (Phase 2 placeholder), "Send email" (Phase 2 placeholder); empty-state card; "+ Add Q&A item" button
- `qa-entry.tsx` — single entry component:
  - **Pending entries**: inline editable Q + A textareas with auto-save on blur (only saves if dirty), small "Saving…" indicator
  - **Approved entries**: read-only formatted display (Q in bold, A below), green-tinted card with green left border
  - Per-entry actions: Approve button (disabled until Q + A both filled), Unapprove (returns to draft), Delete (with browser confirm)
- Server actions: `addQaItem`, `updateQaItem`, `setQaApproved`, `deleteQaItem`, `approveAllQaItems`

### Done — Chunk 3: Issues tracker tab
- `issues-view.tsx` — server, fetches issues with assignee join (LEFT JOIN users); also fetches the org's user list for the assignee picker
- `issues-list.tsx` — client; toolbar with open/in-progress/resolved counts; "+ Add Issue" button; empty-state card
- `issue-status-badge.tsx` — clickable status badge with dropdown picker (Open / In Progress / Resolved); same pattern as TierBadge
- `add-issue-modal.tsx` — form: title (required), description, status, priority, assigned (Unassigned + org user list), date identified (defaults to today). Reused for edit mode via `editing` prop.
- Each issue card: status badge + priority chip in header; row actions (edit/delete) revealed on hover; status-colored left border (red/amber/green); assignee + identified date in meta footer
- Server actions: `addIssue`, `updateIssue`, `setIssueStatus`, `deleteIssue`

### Decisions
- **Modal-based for Issues, inline-edit for Q&A.** Q&A entries naturally feel like they want inline editing (often dictation-style during a meeting); Issues feel like discrete records that warrant a deliberate "save" gesture.
- **Auto-save on blur** for Q&A textareas, with dirty-checking so we don't fire writes on focus-only (no-change) blurs.
- **Q&A approve gated on filled Q + A.** Prevents accidental approval of empty items.
- **Add Builder is its own modal** (not inside Add Contact). Two separate flows, two clear buttons. Avoids a complex multi-mode form.
- **`window.confirm()` for issue delete**, custom Dialog for contact delete. Inconsistency to revisit — could promote both to Dialog or use shadcn AlertDialog when installed. Minor.
- **Drizzle `.returning({ id: x })` typed-column form doesn't work across our two-driver swap** — TypeScript narrows to the intersection. Switched to plain `.returning()` (returns all columns, harmless overhead at our row sizes).
- **`addBuilderToDeal` uses a transaction** — atomic builder + deal_buyer creation. No orphan builders if the deal_buyer insert fails.

### Notes for next steps
- Consultants tab (still ComingSoon)
- Deal CRUD: create new deal modal (currently disabled "+ New Deal" button), edit deal info, delete deal
- Lead user reassignment in the Contacts table
- Promote `window.confirm()` to a proper dialog for parity
- Q&A: optional generated entry numbering (sequential per deal) instead of the index in the visible list
- Q&A: "Generate PDF" and "Send email" wire-up — Phase 2

### Blockers
- None.

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
