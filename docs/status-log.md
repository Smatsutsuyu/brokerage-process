# Status Log — Lakebridge Capital Deal Lifecycle Platform

Running record of work, decisions, deferrals, and blockers. Newest day at top. Source for on-demand status reports (daily, weekly, client-facing, etc.).

---

## 2026-04-30 — Day 1: Scaffold

### Done
- Next.js 16.2.4 app scaffolded (App Router, Turbopack, TypeScript strict, Tailwind v4, ESLint 9, src/ layout)
- shadcn/ui initialized (`base-nova` preset — uses BaseUI under the hood, not Radix)
- 12 base shadcn components installed: badge, button, card, checkbox, dialog, input, label, select, sonner, table, tabs, textarea
- Prettier + `prettier-plugin-tailwindcss` configured; `format` and `format:check` npm scripts added
- `references/` folder created and populated with client design assets (prototype HTML, Excel wireframe, discovery CSV, proposal, plan, account setup checklist)
- Lint and build both pass clean
- CLAUDE.md updated to reflect actual installed versions (Next 16, React 19, Tailwind v4) and Day 1 progress

### Decisions
- **Next.js 16 instead of Next 15** as originally specified in CLAUDE.md. Latest stable now ships as 16; using current best-practice and noted in CLAUDE.md for transparency.
- **shadcn `base-nova` preset (BaseUI-backed) over the older Radix-backed preset.** This is the modern shadcn default — no reason to opt out.
- **`Sonner` instead of `Toast`** for toast notifications. shadcn renamed/replaced the Toast primitive with Sonner; CLAUDE.md's "Toast" maps to `sonner.tsx`.
- **`form` component skipped at scaffold time.** Modern shadcn registry no longer ships a standalone form component — pattern is now react-hook-form + zod added when the first form lands. Will install in week 2.
- **Project scaffolded into repo root** (not nested under `app/` or similar). Standard Next.js layout, plays cleanest with Vercel and shadcn defaults.
- **`base-color: slate`** for shadcn theming. Neutral choice, easy to retheme to Land Advisors brand colors when the prototype is studied in week 2.

### Deferred / Pending
- **Vercel deploy** — pending Lakebridge Vercel account creation. Once available, will be a single "import repo" click.

### Blockers
- None active. Day 2 (tooling layer: Drizzle, Clerk, Sentry, Resend SDK, env management) can begin without external input.
