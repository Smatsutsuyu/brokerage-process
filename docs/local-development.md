# Local Development

Setup and daily workflow for running the Lakebridge platform locally.

## Prerequisites

- **Node.js** 20 or newer (`node --version`)
- **npm** 9+ (`npm --version`)
- **Docker Desktop** for the local Postgres container (`docker --version`)

## One-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in values for your local machine.
#    For local-only dev, the values in .env.local should already work
#    (Postgres on Docker, placeholder Clerk/Resend keys).
cp .env.example .env.local

# 3. Start the local Postgres container
npm run db:up

# 4. Apply the schema migrations
npm run db:migrate
```

That's it. After this, `npm run dev` brings up the Next.js dev server.

## Daily workflow

```bash
npm run db:up       # Start the Postgres container (no-op if already running)
npm run dev         # Start the Next.js dev server (http://localhost:3000)
```

When you're done, `npm run db:down` stops the container (keeps data on disk).

## Database commands

| Command              | What it does                                                                |
| -------------------- | --------------------------------------------------------------------------- |
| `npm run db:up`      | Start Docker Postgres container                                             |
| `npm run db:down`    | Stop the container (data preserved on disk)                                 |
| `npm run db:reset`   | Wipe all data and restart fresh                                             |
| `npm run db:generate`| Generate a new SQL migration from schema changes (`src/db/schema/*.ts`)     |
| `npm run db:migrate` | Apply pending migrations to the DB pointed at by `DATABASE_URL`             |
| `npm run db:push`    | Push schema directly to DB without a migration file (dev shortcut, careful) |
| `npm run db:studio`  | Open Drizzle Studio (browser UI for inspecting the DB)                      |

### Schema changes

After editing any file in `src/db/schema/`:

```bash
npm run db:generate   # Creates a new migration SQL file in src/db/migrations/
npm run db:migrate    # Applies it
```

Commit both the schema change and the generated migration file together.

### Resetting the local DB

```bash
npm run db:reset      # wipes everything
npm run db:migrate    # re-apply schema
# (optionally: re-seed once a seed script exists)
```

## Switching between local Postgres and Neon

The app uses a runtime driver swap (see [src/db/index.ts](../src/db/index.ts)):

- **URL contains `neon.tech`** → uses `@neondatabase/serverless` HTTP driver (production)
- **Anything else** → uses `postgres.js` driver (local Docker)

To point at real Neon temporarily, just change `DATABASE_URL` in `.env.local` to the Neon connection string. No code change needed.

## Connecting directly to the DB

```bash
docker exec -it brokerage-postgres psql -U postgres -d brokerage_dev
```

Or use Drizzle Studio (`npm run db:studio`) for a browser UI.

## Default credentials

Local Docker Postgres only — never used in production:

- User: `postgres`
- Password: `postgres`
- Database: `brokerage_dev`
- Host: `localhost:5432`

These are defined in [docker-compose.yml](../docker-compose.yml) and matched in `.env.local`.

## Troubleshooting

**`npm run db:up` fails with "open //./pipe/dockerDesktopLinuxEngine"**
Docker Desktop isn't running. Start it from the Windows Start menu, wait for the whale icon in the taskbar to stop animating, then retry.

**`npm run db:migrate` fails with connection refused**
The container is starting up. Wait ~5 seconds and retry. To check status: `docker ps` should show `brokerage-postgres` as `(healthy)`.

**Port 5432 already in use**
You likely have another Postgres running (a system service or another project). Either stop it, or change the port in `docker-compose.yml` (e.g. `"5433:5432"`) and update `DATABASE_URL` in `.env.local` to match.

**Schema looks out of sync with the code**
Easiest fix: `npm run db:reset && npm run db:migrate`. Loses all local data.

**Dev server seems to ignore code changes / sign-in does nothing**
Likely a stale `next dev` process is bound to port 3000 and your new server bound to 3001. Symptom in the new server's log: `Port 3000 is in use by process <PID>, using available port 3001 instead`. Browsers and bookmarks will keep hitting the stale 3000.

```bash
# Find the stale process (cmd shows PID at the end)
netstat -ano | findstr :3000

# Kill it (use the PID from the previous command)
taskkill /PID <PID> /F

# Or, in PowerShell:
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

Then restart `npm run dev`. The new server will bind to 3000 cleanly.

## Signing in locally

After `npm run db:seed`, sign in at [http://localhost:3000/sign-in](http://localhost:3000/sign-in) with either:

- `cshiota@lakebridgecap.com` / `lakebridge-dev-password` (Chris, owner)
- `seanesparza@gmail.com` / `Abcd1234!` (Sean, owner)

Both accounts have `owner` role on the seeded Lakebridge org. Defined in `src/db/seed.ts`.

To add more local members: sign in as Chris (owner role), open the user menu in the sidebar footer, click **Members**, then **Invite member**. The dialog generates an initial password you can share with the new user.

## In-app feedback (review tool)

While Chris is exercising the platform during the build, he can leave in-app feedback that gets stored in Postgres for Sean to triage.

**How it works**

- Floating "Feedback" button bottom-right of every page → captures general/page-level notes.
- Hover over any major section (sidebar, priority ribbon, deal header, each tab) → a small 💬 icon appears in the corner. Click it to comment specifically on that section.
- Each submission captures: section name, page URL, build commit SHA, severity (nit/suggestion/bug/blocker), comment, and submitter email.
- Stored in the `feedback_items` table.

**Reading feedback**

```bash
# Default: show all "new" items grouped by section
npm run feedback:report

# All items including reviewed/actioned/wontfix
npm run feedback:report -- --status=all

# Items still needing attention (new + reviewed)
npm run feedback:report -- --status=open

# Write to a file
npm run feedback:report -- --out=docs/feedback-2026-05-01.md
```

**Marking items reviewed/actioned**

For now, update directly via SQL (admin UI deferred):

```bash
docker exec -it brokerage-postgres psql -U postgres -d brokerage_dev
# UPDATE feedback_items SET status = 'reviewed', reviewed_at = now() WHERE id = '...';
# UPDATE feedback_items SET status = 'actioned', actioned_at = now() WHERE id = '...';
```

**Disabling for production**

Set `NEXT_PUBLIC_FEEDBACK_ENABLED=false` in the production environment (Vercel dashboard). The entire feedback module becomes a no-op — button hides, zones render their children only, no feedback table writes possible from the UI. To strip from the codebase entirely post-handoff:

1. Delete `src/components/feedback/`
2. Delete `src/scripts/feedback-report.ts`
3. Delete `src/db/schema/feedback.ts` and the two `feedback_*` enums in `enums.ts`
4. Generate a migration to drop the table
5. Remove `<FeedbackShell>` and `<FeedbackZone>` references from `src/app/(app)/layout.tsx` and the deal pages
6. Remove `NEXT_PUBLIC_FEEDBACK_ENABLED`, `NEXT_PUBLIC_COMMIT_SHA` from `src/lib/env.ts` and `.env.example`
7. Remove the SHA capture from `next.config.ts`
