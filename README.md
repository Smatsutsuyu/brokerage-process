# Lakebridge Capital Deal Lifecycle Platform

Multi-user deal management for Lakebridge Capital, operating client-facing as Land Advisors Organization. Tracks land brokerage deals through a four-phase lifecycle, manages buyer contacts, generates Land-Advisors-branded documents, and sends templated emails via Resend.

Built on Next.js 16 (App Router + Turbopack), React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle ORM, Postgres (Neon in production, Docker locally), Better Auth, Vercel Blob, and React-PDF. Deployed on Vercel.

## Where to start

| If you are                                    | Read                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Running this locally for the first time       | [docs/local-development.md](docs/local-development.md)                                   |
| A new Claude Code session on this repo        | [CLAUDE.md](CLAUDE.md) (project context + scope decisions)                               |
| A new developer making schema changes         | [docs/schema.md](docs/schema.md)                                                         |
| Operating this in production after handoff    | [docs/operations.md](docs/operations.md)                                                 |
| A user (admin or broker) learning the app     | [docs/features.md](docs/features.md)                                                     |
| Looking for what shipped when                 | [docs/build-progress.md](docs/build-progress.md), [docs/status-log.md](docs/status-log.md) |

## Local quickstart

```bash
npm install
npm run db:up       # starts Docker Postgres
npm run db:migrate  # applies migrations 0000..N
npm run db:seed     # creates a sample org with Chris + Sean as owners
npm run dev         # http://localhost:3000
```

Default sign-in (after seed):

- `cshiota@lakebridgecap.com` / `lakebridge-dev-password`
- `seanesparza@gmail.com` / `Abcd1234!`

## Common scripts

| Script                       | What it does                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`                | Next dev server (Turbopack) on port 3000                                                  |
| `npm run build`              | Production build                                                                          |
| `npm run vercel-build`       | Runs `drizzle-kit migrate && rename:apply && checklist:reconcile && next build`           |
| `npm run db:up` / `db:down`  | Docker Postgres lifecycle                                                                 |
| `npm run db:reset`           | Tear down + recreate the local Postgres volume                                            |
| `npm run db:generate`        | Generate a Drizzle migration from schema changes                                          |
| `npm run db:migrate`         | Apply pending migrations                                                                  |
| `npm run db:seed`            | Seed the sample org                                                                       |
| `npm run db:studio`          | Drizzle Studio (DB explorer)                                                              |
| `npm run feedback:report`    | CLI summary of submitted in-app feedback                                                  |
| `npm run feedback:update`    | Mark a feedback item with a response from the CLI                                         |
| `npm run rename:apply`       | Apply the historical rename/delete registry (`src/scripts/apply-renames.ts`)              |
| `npm run checklist:reconcile`| Sync every deal's checklist against the current template                                  |
| `npm run lint`               | ESLint                                                                                    |
| `npm run format`             | Prettier write                                                                            |

See [docs/operations.md](docs/operations.md) for the deploy flow + when each of the vercel-build sub-steps fires.

## Project layout

```
src/
  app/
    (app)/              # Authenticated app routes (deals, contacts, builders, admin, profile)
    api/                # Route handlers (PDF generation, document streaming, blob upload, feedback attachments)
    sign-in/            # Public sign-in page
  components/
    layout/             # Sidebar, priority ribbon, user link
    feedback/           # In-app feedback widget + shell + comment thread
    confirm/            # Confirm dialog provider
    brand/              # LAO logo component
    ui/                 # shadcn-derived primitives
  db/
    schema/             # One file per table (organizations, users, deals, ...)
    migrations/         # Drizzle-generated migration SQL + snapshots
    checklist-template.ts  # Canonical checklist content (source of truth)
    seed.ts             # Sample org + users + deals
  lib/
    auth/               # Better Auth wrappers, getCurrentUser, getCurrentOrg
    email/              # send wrapper + notify dispatchers + React Email templates
    pdf/                # React-PDF templates + bundled fonts/assets
    env.ts              # Typed env schema (T3 env)
  scripts/
    apply-renames.ts        # Historical rename/delete registry (runs on vercel-build)
    reconcile-checklists.ts # Adds + reorders checklist items per template (runs on vercel-build)
    feedback-report.ts      # CLI: print submitted feedback
    feedback-update.ts      # CLI: respond to a feedback item
public/
  lao-logo.jpg          # Land Advisors logo (used in sidebar + PDFs)
docs/                   # See "Where to start" table above
```

## Engagement context

Consulting build by Sean Esparza for Chris Shiota at Lakebridge Capital, scheduled to hand off to Lakebridge for ongoing operation. The full engagement context, scope decisions (notably: no AI features in this build, no Outlook integration, Resend for email), and handoff strategy live in [CLAUDE.md](CLAUDE.md).
