# Operations Runbook

Operational reference for the Lakebridge brokerage platform after handoff. Intended for the Lakebridge owner, admin, or IT contact who keeps the system running day to day. You do not need to read TypeScript to follow this document, but you should be comfortable in a vendor dashboard (Vercel, Neon, Resend) and the platform's own admin pages.

Companion docs:

- `docs/local-development.md` covers setup for a developer who wants to run the app on a laptop. Most operational tasks do not require that.
- `docs/build-progress.md` is the historical record of what was built and why. Useful when something looks unfamiliar and you want to know when it landed.

## At a glance

The Lakebridge brokerage platform is a workflow and document automation tool for residential land brokerage. It tracks the four-phase deal lifecycle, manages buyer contacts, generates Land Advisors branded PDFs (Marketing Report, Q&A File, Issues PDF), and sends templated emails through Resend. There are no AI features in this build (that work is a separate future engagement). All vendor accounts are owned by Lakebridge. The application is deployed on Vercel at `https://brokerage.lakebridgecap.com` (production) with preview URLs for every pull request. The source code lives in the Lakebridge GitHub organization at the `brokerage_process` repository. Pushes to the `main` branch deploy automatically.

## Vendor accounts

Lakebridge owns and pays for every account below. Sean (the original developer) has collaborator access during the build and through handoff support; that access can be removed at any time from each vendor dashboard.

| Vendor | What it does for us | Where to log in | Who pays |
| --- | --- | --- | --- |
| Vercel (Pro plan) | Hosts the Next.js app, serverless functions, build pipeline, environment variables, custom domain | `https://vercel.com/login` | Lakebridge (Pro tier, $20/month) |
| Neon Postgres | Production database, attached via the Vercel marketplace integration | `https://console.neon.tech` or via Vercel project page, Storage tab | Lakebridge (billed through Vercel marketplace, free tier currently sufficient) |
| Vercel Blob | File storage for uploaded documents, per-deal banners, feedback screenshots | Same Vercel dashboard, Storage tab | Lakebridge (billed through Vercel, expected ~$0.20/month at projected peak) |
| Resend | Transactional email (OM blasts, Deal Team sends, feedback notifications, password resets) | `https://resend.com/login` | Lakebridge (free tier, 3,000 emails/month, sufficient at projected volume) |

For each vendor, the account email should be a Lakebridge-owned shared mailbox or distribution list (for example `it@lakebridgecap.com`) rather than a single person's mailbox. That way, access does not disappear if someone leaves. If the email on file is a personal mailbox today, change it from inside each vendor dashboard, Account Settings.

### If you lose access

- **Vercel**: any other team member with the Owner role can re-invite you. If no one has access, contact Vercel support from the email address on file for the team.
- **Neon**: managed through Vercel. Add yourself to the Vercel team first, then the Neon project becomes visible under the project's Storage tab. Direct sign-in at `https://console.neon.tech` also works if you have an account associated with the Neon project.
- **Resend**: any other member can re-invite. If no one can, use the Resend "forgot password" flow against the account email.

## Common admin tasks

All admin pages are gated to users with the `owner` role.

### Invite a new user

1. Sign in as an owner.
2. Open the user menu in the sidebar footer, click **Members** (this opens `/admin/members`).
3. Click **Invite member**.
4. Enter name, email, role (`owner`, `broker`, `analyst`, or `viewer`).
5. The dialog generates an initial password. Copy it and share through a secure channel. The new user can change it after first sign-in.

Members are invite-only; there is no public `/sign-up` page.

### Change a user's role

On `/admin/members`, click the role dropdown next to the user's name. Changes save immediately. Owners can demote other owners but the system blocks removing the last owner.

### Remove a user

On `/admin/members`, click the trash icon on the user's row. The system:

1. Clears the user's assignments from `deal_team_members` (so deal pages do not break on a stale reference).
2. Hard-deletes the user record.
3. Blocks the action if this is the last owner on the org.

Historical references (who completed which checklist item, who uploaded which document) are preserved because those foreign keys are `ON DELETE set null`.

### Reset someone's password

Send the user to `/sign-in`. They use the **Forgot password** link, which triggers a Better Auth password reset email through Resend. If Resend is not yet sending real mail (DNS still pending), an owner can generate a fresh initial password from `/admin/members` instead.

### Reorder deals in someone's sidebar

Deal order is per-user. Each user reorders their own sidebar from the sidebar's hover controls (up and down arrows on each deal row). There is no admin override; tell the user to drag-reorder their own list.

### Triage in-app feedback

1. Sign in as an owner.
2. Open `/admin/feedback`.
3. Items are grouped by status (new, reviewed, actioned, won't fix) with the section, page URL, build commit SHA, severity, comment, and any attached screenshots.
4. Use the inline comment thread to respond. Set status to "reviewed" when triaged, "actioned" when the underlying fix has shipped.

Submitters can follow up on their own filed items at `/feedback`.

### Review who gets feedback notification emails

1. Sign in as an owner.
2. Open `/profile`.
3. Under the feedback notifications section, owners choose which channels they receive (new submissions, comments on items they responded to, etc.). All four channels default to OFF, so each owner opts in for themselves.

Recipients are managed in-app per user; there is no env-var distribution list.

## Deploys

### Normal flow

1. Developer pushes a commit to `main` on GitHub.
2. Vercel's GitHub integration picks it up automatically.
3. Vercel runs the `vercel-build` script defined in `package.json`:
   ```
   drizzle-kit migrate && npm run rename:apply && npm run checklist:reconcile && next build
   ```
4. Each step in order:
   - `drizzle-kit migrate` applies any new SQL migration files in `src/db/migrations/`. Build fails if a migration fails, no half-applied state.
   - `npm run rename:apply` runs `src/scripts/apply-renames.ts`, which applies any pending checklist category or item renames, deletes, moves, or merges from the historical evolution registry. Idempotent.
   - `npm run checklist:reconcile` runs `src/scripts/reconcile-checklists.ts`, which walks every deal and ensures the current `CHECKLIST_TEMPLATE` (in `src/db/checklist-template.ts`) is reflected. Adds missing items at the correct position, updates sort order when it drifts. Never deletes; never modifies names. Idempotent.
   - `next build` produces the optimized production bundle.
5. Vercel promotes the new build to production at `https://brokerage.lakebridgecap.com`.

If any of those pre-build steps fail, the deploy is aborted and the previous production build stays live. The full log is in the Vercel dashboard under the failed deployment.

### Preview deploys

Every pull request gets its own preview URL (something like `brokerage-process-git-<branch>-lakebridge.vercel.app`) with its own Neon branch database. Useful for reviewing a change before merging. Preview deploys do not affect production data.

### Rolling back

1. Open the Vercel dashboard, project `brokerage-process`, Deployments tab.
2. Find the last known-good deployment.
3. Click the three-dot menu on its row, choose **Promote to Production**.
4. Production traffic switches to that build immediately. The database does not roll back automatically; see "Database operations" below if a migration needs to be reversed.

### Do not run `vercel --prod` manually

The GitHub integration already pushes every `main` commit to production. Running `vercel --prod` from a terminal creates a duplicate deployment that does not match the Git history, which makes audit traceability worse. If a hotfix is needed, push a commit; do not deploy from CLI.

## Where to look when something breaks

Sentry was removed early in the build to reduce vendor count. The primary error surface is Vercel's function logs.

| Symptom | First place to look |
| --- | --- |
| App returns 5xx, blank page, or "Application error" | Vercel dashboard, project `brokerage-process`, **Logs** tab (or Functions, Logs). Filter by status code or function name. |
| Specific page or API route misbehaves | Same Logs tab, filter by the route path (for example `/api/deals/[id]/marketing-report.pdf`). |
| Slow page loads | Neon dashboard, project `brokerage-process`, **Monitoring**, Slow queries view. Cross-reference with the Vercel function logs for the same time range. |
| Email did not send or bounced | Resend dashboard, **Logs** tab. Each send is recorded with status, recipient, and the SDK error if any. |
| Visual or UX bug a user reported | Ask the user to file in-app feedback via the floating button or the per-section bubble icons. The submission captures the page URL, commit SHA, and an optional screenshot. View on `/admin/feedback`. |

Vercel's status page at `https://www.vercel-status.com` is worth checking first when nothing app-specific seems wrong.

## Email pipeline

The platform sends mail through Resend. One Resend account covers both pipelines (feedback notifications and client-facing sends). Configuration lives in three places:

- **Resend dashboard, Domains**: the `landadvisors.com` sender domain is verified here. Resend supplies the DKIM, SPF, and DMARC records to publish.
- **DNS host for `landadvisors.com`**: the records from Resend are published at LAO IT's DNS host. Verification takes minutes to a few hours.
- **Vercel environment variables**:
  - `RESEND_API_KEY` (Secret): the API key from Resend, scoped to send-only.
  - `EMAIL_FROM`: the from-address for the feedback pipeline only — `no-reply@landadvisors.com`. The `no-reply` prefix is deliberate: feedback notifications are one-way and replies aren't monitored. Client-facing sends (OM blast, Deal Team) use a hardcoded `cshiota@landadvisors.com` from the composer's sender dropdown and override `from` on the per-send call.

When `RESEND_API_KEY` is unset or empty, the platform's `sendEmail` helper becomes a no-op: it logs the intended send and returns success. The user-facing action does not fail. This lets dev boot without a Resend account.

If an email fails after the API key is set:

1. The error is logged to Vercel function logs (search for `sendEmail` or `email:api-error`).
2. For feedback notifications, the user-facing action still succeeds (the comment, status change, or feedback creation is committed) so the UI does not get stuck.
3. For client-facing sends (OM blast, Deal Team), the composer toast surfaces a per-builder failure summary so the user knows which sends to retry or send manually.
4. The Resend dashboard Logs tab shows the underlying delivery failure with the SMTP / API error.

### Send throttle + rate-limit retry

Resend caps requests per second per account. A blast to many builders is one outbound message per builder, so a large blast can burst past that cap. The blast pipeline (`src/lib/email/blast.ts`) throttles sends to a minimum gap between starts (`SEND_INTERVAL_MS` env var, default 250ms ≈ 4/sec) and retries any send that still comes back rate-limited with linear backoff (up to 3 retries). If blasts ever start failing with `rate_limit_exceeded` in the Resend logs, raise `SEND_INTERVAL_MS` in Vercel env and redeploy. A 30-builder blast takes roughly 7.5 seconds at the default interval; that wait is expected, not a hang.

### Sender BCC

Every client-facing send (OM blast, Deal Team Send, Phase 2 buyer blasts) BCCs the selected sender's address. Resend sends mail through its own SMTP, not through the sender's Outlook mailbox, so without this step the sender has no record of platform sends in their inbox at all. With the BCC, a copy of every outbound message lands in the sender's Inbox (an Outlook rule can route them into a "Platform sends" folder for a Sent-Items-style view). The BCC is suppressed when the sender is already in the To or CC list to avoid duplicate delivery. Feedback-pipeline notifications do not BCC because the recipient list is already the audience.

### Attachment pre-flight on Phase 2 row sends

Phase 2 "Send …" buttons that exist solely to ship a document (Market Study, DD folder, etc.) validate the source row's attachments before opening the composer. If the requirement isn't met, the click is rejected with an inline red bubble anchored under the button (see `src/components/inline-error-bubble.tsx`). Two modes:

- **`requireAttachment="file"`** — at least one uploaded file must be on the row. Use when the recipient needs the document attached to their email (Market Study, Q&A File). Links don't count.
- **`requireAttachment="any"`** — at least one file or link on the row. Use when a Dropbox / SharePoint folder URL is the normal case (Share Marketing Due Diligence Folder).

Network errors during the pre-flight check still surface as a sonner toast since they aren't tied to row data state.

## Storage

All uploaded files live in **Vercel Blob**, private store. Files are never publicly served by URL; every read goes through `/api/documents/[id]` (or the analogous banner / feedback-attachment routes), which checks the requesting user's auth before streaming the blob back. This gives a full audit trail at the cost of a small compute hit per download.

What lives where:

| Asset | Store | Served by |
| --- | --- | --- |
| Checklist item documents | Vercel Blob (private) | `/api/documents/[id]` with auth gating |
| Per-deal hero banners | Vercel Blob (private) | `/api/deals/[id]/banner` |
| Feedback screenshots | Vercel Blob (private) | `/api/feedback/attachments/[id]` |
| Land Advisors logo | `public/lao-logo.jpg` | Bundled with each deploy. Not in Blob. To replace, commit a new file at that path. |

Document deletes are soft at the user level (replace bumps the version, old blobs remain in storage with the historical row). There is no automatic cleanup. At projected volume (~7.5 GB peak across the engagement) this is fine; if storage costs become noticeable, an admin can run a purge script against old document versions. No such script exists today; flag this back to a developer.

Vercel Blob's storage and bandwidth are visible on the Vercel dashboard under the project's Storage tab.

## Database operations

The production database is a Neon Postgres project, attached to Vercel via the marketplace integration.

### Inspecting data

1. Open the Vercel dashboard, project `brokerage-process`, Storage tab, click into the Neon database.
2. Use the **SQL Editor**. By default it connects as the read-only role, which is the safe default for ad-hoc queries.
3. To make a change, switch the role at the top of the SQL editor to the read-write role. This is the same role used by the application via `DATABASE_URL`.

### Backup and restore

Neon provides **point-in-time recovery** out of the box (7 days on the free tier, longer on paid tiers). To restore:

1. In the Neon dashboard, open the project.
2. Choose **Branches**, **Create branch**.
3. Set the source to "Point in time" and pick the timestamp.
4. The new branch is a full restore at that moment. Inspect, copy data out, or swap the production connection string to it.

There is no scheduled export job; Neon's PITR is the backup. If a long-term archive is required for compliance, set up a scheduled `pg_dump` via a separate cron tool and store the output in Vercel Blob or off-platform storage.

### The connection string

`DATABASE_URL` is set in Vercel environment variables and is marked Sensitive. Never edit production data by running a one-off script that sets a different string; always apply changes through a migration file checked into Git, so the change history is preserved.

The application uses Drizzle ORM. Schema lives in `src/db/schema/`, migrations in `src/db/migrations/`. The `db:push` command (which applies the schema directly, skipping migration files) is off-limits for any environment that runs `db:migrate`. This is enforced by convention; see the build-progress log entry for 2026-05-01 if you want the full backstory.

## Common npm scripts

Almost everything happens automatically via `vercel-build` on deploy. The scripts below exist for local development, ad-hoc tasks, or running scripts against production from a developer laptop.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server on `http://localhost:3000`. |
| `npm run build` | Production build locally (does not run migrations or reconcile). |
| `npm run db:up` | Start the local Docker Postgres container. |
| `npm run db:down` | Stop the container (data preserved). |
| `npm run db:migrate` | Apply pending migrations to the DB pointed at by `DATABASE_URL`. |
| `npm run db:generate` | Generate a new migration SQL file from schema changes. |
| `npm run db:seed` | Seed the local DB with sample data. |
| `npm run db:studio` | Open Drizzle Studio, a browser UI for inspecting the DB. |
| `npm run rename:apply` | Apply pending checklist renames / deletes / moves. Runs in `vercel-build`; also runnable manually. |
| `npm run checklist:reconcile` | Walk every deal and align its checklist to `CHECKLIST_TEMPLATE`. Runs in `vercel-build`. |
| `npm run feedback:report` | Print the in-app feedback queue. Add `-- --status=open` for open items, `-- --status=all` for everything. |
| `npm run feedback:update` | Mark a feedback item reviewed or actioned and post a response. |

To run any of these against production from a developer laptop, prefix with an inline `DATABASE_URL=...` from the Vercel env (see the Vercel CLI env-quirks notes in the developer memory; `vercel env pull` does not include Sensitive vars).

## Configuration changes

### Adding or changing an environment variable

1. Vercel dashboard, project `brokerage-process`, Settings, **Environment Variables**.
2. Add the variable. Choose which environments it applies to (Production, Preview, Development).
3. Mark it Sensitive if it is a credential.
4. Redeploy: either push a new commit, or in the Deployments tab, click the three-dot menu on the latest production deployment and choose **Redeploy**. Env vars only take effect after a fresh build.

Canonical list of expected env vars (from `src/lib/env.ts`):

- `DATABASE_URL` (Sensitive, required): Neon Postgres connection string.
- `BETTER_AUTH_SECRET` (Sensitive, required, 32+ chars): signing secret for auth sessions.
- `BETTER_AUTH_URL` (required): the public URL of the app (production: `https://brokerage.lakebridgecap.com`).
- `RESEND_API_KEY` (Sensitive, optional): Resend API key. When unset, email sends are no-ops.
- `EMAIL_FROM` (optional): from-address for the feedback-notification pipeline (currently `no-reply@landadvisors.com`). Client-facing sends override this per call.
- `SEND_INTERVAL_MS` (optional): minimum gap in milliseconds between outbound blast sends. Throttles a blast under Resend's per-second rate limit. When unset, the code default (250ms ≈ 4 sends/sec) applies. Raise it if Resend lowers the cap or blasts still hit rate limits; set to `0` to disable throttling.
- `DEV_BLAST_SENDER_EMAIL` (optional, dev): replaces the blast composer's "From:" address (`cshiota@landadvisors.com` by default). Used in local dev to route blasts through a different verified Resend domain. Leave unset in production deploys.
- `NEXT_PUBLIC_FEEDBACK_ENABLED` (optional, defaults to `true`): set to `false` to disable the in-app feedback widget in production.
- `NEXT_PUBLIC_COMMIT_SHA` (auto-injected by Vercel from the build commit; do not set manually).
- `NEXT_PUBLIC_APP_URL` (optional): used to build absolute URLs in emails. Set to the production URL.

### Adding a new checklist item

1. Edit `src/db/checklist-template.ts` and add the item under the correct phase and category.
2. Commit and push. The next deploy runs `checklist:reconcile` and inserts the new item into every existing deal at the correct sort order.
3. Do not run `rename:apply` for additions. That script is only for renames, deletes, moves, or merges of items that already exist.

### Renaming or removing a checklist item

This needs a developer because it requires appending a new entry to `src/scripts/apply-renames.ts` alongside the `CHECKLIST_TEMPLATE` edit. Flag the change to whoever holds developer access; the conventions are documented inline at the top of `apply-renames.ts`.

## Escalation matrix

| Problem | First action | Then |
| --- | --- | --- |
| App is down or returning errors | Check the Vercel status page at `https://www.vercel-status.com`. | If Vercel is healthy, open the project's Logs tab and search the time range. Roll back if needed. |
| Email is not sending | Open the Resend dashboard, Logs tab. Check the most recent attempts. | Verify `EMAIL_FROM` and `RESEND_API_KEY` are set in Vercel env. Confirm the sender domain still shows "Verified" in Resend, Domains. |
| Database is slow | Neon dashboard, Monitoring, Slow queries. | If a query is pathological, capture it and send to a developer for an index. The platform was built without indexes by design at this scale, so the first slow query is expected to get attention. |
| User cannot sign in | Open `/admin/members`, find the user, verify they exist and the role is correct. | If the user exists but cannot get in, use the Better Auth password reset flow from `/sign-in`. If reset email does not arrive, check Resend logs. As a last resort, regenerate an initial password from `/admin/members`. |
| File upload or download fails | Vercel function logs, filter by `/api/documents`. | Check Vercel Blob status in the Storage tab; verify the project still has Blob enabled. |
| Something else | Contact Sean (seanesparza@gmail.com, 626-818-8087) during the handoff support period. | After handoff support ends, route to whichever developer Lakebridge has retained for ongoing maintenance. (TBD as of handoff; fill in here once decided.) |
