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
