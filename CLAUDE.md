# CLAUDE.md — Lakebridge Capital Deal Lifecycle Platform

This file is the authoritative project context for Claude Code working on the Lakebridge Capital platform build. It supersedes the original CLAUDE.md from the prototype session.

---

## Quick Start for Claude Code

**If this is your first session on this project, read this entire file before doing anything.** Then read `references/marketing-process-checklist.html` (Chris's prototype, the authoritative UI reference) and `references/Marketing Process Checklist.xlsx` (Chris's wireframe spreadsheet, the source for hierarchical checklist structure).

**To run the platform locally**, see [docs/local-development.md](docs/local-development.md). TL;DR: `npm install`, `npm run db:up`, `npm run db:migrate`, `npm run dev`. Local Postgres runs in Docker; Clerk/Resend keys can stay as placeholders until those accounts are live.

**Current phase:** Phase 1 (Foundation), week 1. Goal: scaffold and ship to a Vercel preview URL before doing anything else.

**Headline scope decisions (locked, do not revisit without explicit instruction):**

- Multi-user platform from launch (not single-user)
- **No AI features in this build.** All AI-led deliverables (OM prose, Recommendation Memo, LOI parsing, tier-personalized email drafting) are deferred to a future engagement. The Anthropic API account, prompt caching infrastructure, and AI generation UI are all out of scope.
- No direct Outlook integration. Email automation goes through Resend (templated drafts, user reviews and clicks send).
- Hierarchical checklist structure (matches Excel), not the prototype's flat list.

**What this means in practice:** the platform is a workflow + document automation tool. It tracks the deal lifecycle, manages buyer contacts, generates templated branded documents, and sends templated emails. No LLM calls anywhere in the application.

**Implementation order for Phase 1:**

1. Day 1: Next.js scaffold, Vercel deploy. Empty shell at a live URL.
2. Day 2: Tooling layer (Drizzle, Clerk SDK, Sentry, env management). No configuration yet.
3. Day 3: Connect Neon, run hello-world migration.
4. Day 4-5: Core schema (organizations, users, deals, builders, contacts, hierarchical checklist, Q&A items, issues, consultants, documents).
5. Day 6-7: Configure Clerk auth, build app shell with sidebar nav.
6. Week 2-3: Build the prototype-equivalent functionality on top.

After major milestones, update this file with what was built and any decisions made along the way. Treat it as a living document.

---

## Engagement Context

**Client:** Lakebridge Capital (operating client-facing as Land Advisors Organization).
**Primary stakeholder:** Chris Shiota (cshiota@lakebridgecap.com).
**Developer:** Sean Krake Esparza (seanesparza@gmail.com, 626-818-8087), operating solo with Claude Code as the implementation engine, in an engineering-manager capacity.
**Engagement type:** Hosted platform build, approximately seven weeks across three phases, designed for full handoff to Lakebridge for ongoing client-managed operation. Timeline reduced from the original eight weeks because all AI-led work is deferred.

## Origin

Chris built a working HTML prototype (`marketing-process-checklist.html`) in a previous Claude session that demonstrates the full deal lifecycle workflow: four-phase checklist, buyer tiering, Q&A workflow, issues tracker, consultant roster, and document generation action buttons. **The prototype is the authoritative UI reference.** The platform should preserve its layout, visual approach, and feature set.

Chris also built `Marketing_Process_Checklist.xlsx` as a wireframe/design notes spreadsheet. Where the Excel and the HTML differ, **the Excel wins on data structure** (especially the hierarchical checklist) and **the HTML wins on UI layout**.

The prototype lives in browser localStorage with no persistence. The platform replaces that with real backend storage and team-wide access while keeping the prototype's UX intact.

## Business Domain

Lakebridge brokers residential land deals to homebuilders. Deals follow a structured four-phase lifecycle.

### Phase 1: Initial Checklist (Going to Market)

Pre-marketing prep:

1. Listing Agreement
2. Initial List of Potential Buyers
3. HOA Budget
4. Cost to Complete
5. CFD Analysis
6. Market Study (optional)
7. Premium Analysis
8. Valuation
9. Entitlement Schedule
10. Development Schedule (optional)
11. Entitlement Summary
12. Custom Underwriting File for Deal
13. Offering Memorandum
14. Marketing Report (Green/Yellow/Red buyer categorization)
15. Determine PSA Attorney (drafting preference)

### Phase 2: Marketing Process

1. Send out OM / Blast (personalized by buyer tier)
2. Request In-Person Meeting with Top (Green) Buyers
3. Coordinate a Q&A File
4. Send out Q&A File
5. Share Market Study (optional)
6. Email Notification of Offers Due (X days before)
7. Day-of Reminder
8. Automated follow-up to Green & Yellow buyers whose offers haven't come in

### Phase 3: Ownership Summary of Offers

1. Schedule Meeting with Ownership
2. Create Initial Summary (send out as received)
3. Review Underwriting Sheets for clarification
4. Run LOI through AI → SOO Matrix
5. Run UW Sheets through AI → Revenue Charts & UW Summary
6. PDF everything together
7. Create Recommendation memo (Pro/Con of each offer)

### Phase 4: Deal Management

1. Share All Due Diligence
2. Kick Off PSA
3. Kickoff Call
4. Bi-Weekly Meeting Schedule for DD
5. Determine CTC Date
6. Issues Tracking Sheet (living document)
7. Consultant Roster (Landscape Architect, Civil Engineer, Soils Engineer, Cost to Complete Consultant, HOA Consultant, Dry Utility Consultant, Phase 1 Consultant, Land Use Consultant, Biologist)

## Terminology

| Term                 | Definition                                            |
| -------------------- | ----------------------------------------------------- |
| OM                   | Offering Memorandum                                   |
| LOI                  | Letter of Intent                                      |
| PSA                  | Purchase and Sale Agreement                           |
| SOO                  | Summary of Offers (side-by-side comparison matrix)    |
| UW                   | Underwriting (financial analysis)                     |
| DD                   | Due Diligence                                         |
| CTC                  | Cost to Complete                                      |
| CFD                  | Community Facilities District (special tax district)  |
| HOA                  | Homeowners Association                                |
| DIF                  | Development Impact Fees                               |
| TM                   | Tentative Map (entitlement milestone)                 |
| GP                   | Grading Permit                                        |
| SDBL                 | State Density Bonus Law                               |
| Green / Yellow / Red | Buyer interest tiers (interested / evaluating / pass) |

## Buyer Contact Model

Each deal carries its own contact list. Each contact has:

- Builder/Company name
- Contact person, title, email, phone
- Private vs. Public builder classification
- Interest tier (Green/Yellow/Red)
- Lead assignment (which team member owns the relationship)
- Called / OM Sent tracking flags
- Comments

Buyers are homebuilders, both public (Lennar, Pulte, KB Home, Toll Brothers, D.R. Horton, etc.) and private (Intracorp, Shea, New Home Co., etc.).

## Branding

All client-facing documents use **Land Advisors Organization** branding:

- Logo: geometric mountain/layers icon + "Land Advisors" text + "ORGANIZATION" subtitle
- Address: 100 Spectrum Center Drive Suite 1400, Irvine CA 92618
- Footer with office address on every page
- Clean, professional formatting (bold questions, regular-weight answers in Q&A docs)

The platform's internal UI can use either Lakebridge or Land Advisors branding (TBD via discovery). Generated client-facing documents always use Land Advisors branding.

---

## Architectural Decisions

### Stack

| Layer          | Choice                                                              | Notes                                                                            |
| -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Application    | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui | Scaffolded 2026-04-30 with Next 16 (current latest, newer than this doc originally specified). shadcn `base-nova` preset uses BaseUI under the hood, not Radix. Single codebase, single deploy, API routes colocated with UI. |
| Hosting        | Vercel Pro                                                          | $20/month, required (Hobby tier prohibits commercial use)                        |
| Database       | Neon Postgres                                                       | Free tier (0.5 GB) sufficient for years; Launch tier ($19) when needed           |
| File Storage   | Cloudflare R2                                                       | Free tier (10 GB), no egress fees, S3-compatible                                 |
| Auth           | Clerk                                                               | Free tier (50K MAU), use Clerk's organizations primitive                         |
| AI             | Anthropic API direct                                                | Claude Sonnet 4.6 for substantive generation, Haiku 4.5 for emails/short outputs |
| Email          | Resend                                                              | Free tier (3K/month, 100/day) sufficient                                         |
| Monitoring     | Sentry                                                              | Free tier (5K errors/month)                                                      |
| PDF Generation | React-PDF (`@react-pdf/renderer`)                                   | Server-side, fast, no Chromium dependency                                        |

### Multi-Tenancy

**Decision: Full org abstraction from day one.** Every entity carries an `org_id` foreign key. Use Clerk's organizations primitive for the auth layer. Single tenant at launch (Lakebridge), but the architecture supports isolated environments out of the box. Useful for Lakebridge's own testing/sandbox needs and for any future expansion (sister brands, white-label scenarios).

The cost of building this in is hours; retrofitting later would be weeks. Asymmetry justifies including it.

### Roles

Four roles with per-deal permissions layered on top:

- **Owner / Admin** — full access including user management, role assignment, platform settings. Owns vendor accounts and billing relationships externally. Typical user: firm leadership.
- **Broker** — create/manage deals, contacts, documents. Run document generation. Send emails. Typical user: senior team members handling deals.
- **Analyst** — view deals, edit UW data, run analyses. Limited or no email send permissions. Typical user: junior team members and analysts.
- **Viewer** — read-only access to assigned deals (particularly SOOs and recommendation memos). Typical user: ownership reviewing offers.

### Document Generation Philosophy

**All document generation in this build is templated and deterministic.** No LLM calls anywhere in the application. Every output is rendered from structured data using fixed templates with variable substitution.

This is a deliberate scope decision. AI-led deliverables (OM prose, Recommendation Memo, LOI parsing, tier-personalized emails) are deferred to a future engagement. The platform is built so they can be added later without restructuring, but they are not built now.

#### Templated outputs (in scope, all deterministic)

- Q&A File (Land Advisors-branded PDF)
- Marketing Report (filtered buyer list by tier)
- Entitlement Schedule
- Custom Underwriting File (Excel template populated)
- Standard emails (notifications, deadline reminders, Q&A distribution, OM blasts, follow-ups) — drafted by template, reviewed in UI, sent via Resend
- Compiled Packages (multiple PDFs merged)
- CFD Analysis (templated with structured data and a fixed narrative paragraph)
- Premium Analysis (same)
- Valuation (same)
- Entitlement Summary (same)

#### Deferred to future engagement (do not build)

- Offering Memorandum prose generation
- Recommendation Memo
- LOI parsing (extracting structured offer terms from buyer-submitted PDFs)
- SOO Matrix generated from parsed LOIs (the matrix template can exist, populated manually for now)
- Tier-personalized email drafting (current scope: tier-aware templated emails, not AI-generated)

When the future AI engagement begins, the patterns to use are: prompt caching for system prompts, server-side generation only, AI-drafted output tagging (the original CLAUDE.md plan for these still holds).

### Email Delivery

Outbound emails are sent through Resend, not via direct Outlook integration. The user reviews each email in the platform UI, edits if desired, and clicks send. The platform handles the Resend API call. No Microsoft Graph API integration. From-address uses a Lakebridge-verified sender domain configured in Resend.

This means: the user's Outlook still works as their primary email client for inbound and ad-hoc outbound. The platform handles only deal-related outbound where templating and tracking matter.

### Cost Model

**Monthly infrastructure: $20** (Vercel Pro only; everything else free at this scale).
**AI usage: $0** (no AI features in this build).
**Total operating cost: ~$20/month.**

When the future AI engagement happens, expect $1-10/month additional in Anthropic API usage at typical Lakebridge volume.

Build cost handled separately via engagement letter (not in scope of this CLAUDE.md).

---

## Phased Build Plan

Approximately seven weeks across three phases. Compressed from the original eight weeks because all AI-led work is deferred. Client testing is built into each phase via a preview deploy and 2-3 days of active client use.

### Phase 1: Foundation (3 weeks)

- Project scaffold (Next.js, TypeScript, Tailwind, shadcn/ui)
- Auth integration (Clerk with organizations)
- Database schema and migrations (Drizzle ORM)
- Database structure for organizations, users, deals, builders, contacts, hierarchical checklist items, Q&A items, issues, consultants, document metadata
- UI built from prototype, faithful to its layout, with hierarchical checklist structure (per Excel) rather than flat
- Sentry, R2 setup
- Deploy to Vercel preview environment for client testing in second half of phase

### Phase 2: Document and Email Generation (2 weeks)

Templated outputs only. No LLM calls. Mid-phase preview deploy after PDFs are working; end-of-phase deploy after email send works.

- Document upload to R2, organized by deal and document type
- Document viewer (PDF inline, Excel preview, image preview)
- Document versioning (automatic — every save creates a version)
- React-PDF infrastructure for branded outputs (Land Advisors branding throughout)
- Templates implemented:
  - Q&A File (Land Advisors-branded PDF, structured from approved Q&A items)
  - Marketing Report (filtered buyer list by tier)
  - Entitlement Schedule
  - Custom Underwriting File (xlsx generation)
  - Compiled Package (PDF merge)
  - CFD Analysis, Premium Analysis, Valuation, Entitlement Summary (templated narrative + structured data)
- Email pipeline via Resend:
  - Sender domain verification (DNS step Chris will assist with)
  - Templated email composition with variable substitution
  - In-platform review/edit before send
  - Send via Resend API
  - Sent status tracking and history per deal/recipient

### Phase 3: Polish, Operations, Handoff (2 weeks)

- Audit log UI and exports
- Backup verification and restore drill
- Admin panel: user management, role assignment, billing visibility (links to vendor billing dashboards)
- Operational runbook (account access, common admin tasks, monitoring response, escalation paths)
- Recorded video walkthroughs of admin panel and common scenarios
- Architecture diagram and developer onboarding guide
- Final security review and dependency audit
- Production cutover and final acceptance testing

---

## Handoff Strategy

The platform is designed from day one for Lakebridge to operate without ongoing developer dependency.

### Vendor Account Ownership

**All accounts are created in Lakebridge's name from the start.** Sean does not create accounts in his name and transfer them later. This avoids messy ownership transitions at handoff.

| Vendor     | Billed For          | Why Direct Access Matters                                    |
| ---------- | ------------------- | ------------------------------------------------------------ |
| Vercel     | Hosting             | Deploys, domain config, env variable management              |
| Neon       | Database            | Backups, point-in-time restore                               |
| Cloudflare | R2 storage          | Document storage; may also host DNS                          |
| Clerk      | Auth                | User management, MFA, session revocation                     |
| Resend     | Email               | Sender domain verification, deliverability                   |
| Sentry     | Monitoring          | Error alerts, issue triage                                   |
| Anthropic  | AI usage (deferred) | Not needed for this build. Set up when AI engagement begins. |

### What Lakebridge Can Do Without a Developer

- Invite users, change roles, recover passwords
- Review audit logs
- Monitor billing and respond to vendor alerts
- Resolve day-to-day operational issues through the admin panel
- Deploy code automatically via Vercel from the repository (no manual steps)

### What Still Needs a Developer

- New features
- Schema migrations
- Major UI changes
- Integration additions
- Periodic dependency maintenance (every quarter or two)

### Handoff Deliverables

- Operational runbook
- Recorded video walkthroughs
- Architecture diagram and onboarding guide
- Code repository in Lakebridge-owned GitHub or GitLab org

---

## Discovery Status

Discovery questionnaire was completed by Chris Shiota on 2026-04-28. Responses fall into three categories: confirmed answers (settled), outstanding follow-ups (small, can be resolved by email/call), and scope decisions pending (require a substantive conversation before Phase 1 starts).

### Confirmed Answers (settled, ready to build against)

**Brand and Domain**

- Subdomain: **brokerage.lakebridgecap.com**
- Branding: **Land Advisors Organization** branding throughout the platform UI (single brand, no context-switching)
- DNS management: **Not yet confirmed** — Chris said "Not sure - need to check" (see Outstanding)

**Application Behavior**

- Checklist structure: **Hierarchical** (matches Excel design, not the prototype's flat list). Phase 1 items group under categories like Valuation → CMA / Premium Analysis / RPA / Valuation; Third Party Marketing Reports → CTC / Dry Utility Budget / CFD / Market Study; Marketing Documents → Entitlement Schedule / Development Schedule / Entitlement Summary
- Checklist dependencies: **Enforce** — block items until prerequisites are checked. Examples Chris gave: "Can't send Q&A without final Q&A, can't send OM without OM done"
- Builder-contact data model: **Confirmed strawman** — Builder = company, Contact = person, each Contact belongs to a Builder
- Buyer tiering: **Per-deal**, reset for each new deal. Four states: Green, Yellow, Red, **Not Selected on Deal** (new fourth state)
- Project information location: **Top of checklist page** (Deal Name / Units / City / Type)
- Document statuses: **Draft / Final** (simpler than the proposed Draft/In-Review/Final)
- Document versioning: **Automatic** — every save creates a version

**Consultant Roster (authoritative list)**
The CLAUDE.md/prototype list of nine roles, plus two additions from the Excel:

1. Landscape Architect
2. Civil Engineer
3. Soils Engineer
4. Cost to Complete Consultant
5. HOA Consultant
6. Dry Utility Consultant
7. Phase 1 Consultant
8. Land Use Consultant
9. Biologist
10. **Architect** (added)
11. **PSA Attorney** (added)

**Multiple consultants per role:** Yes, with nuance. Per Chris: "There can be one consultant for civil with 2 civil engineers working for that firm for the buyer or seller. There can also be 1 civil engineering firm for each buyer and seller with multiple or 1 person per civil firm." Translation for the data model: each role can have multiple firms (split by buyer/seller side), and each firm can have multiple individual contacts. Chris noted this is "a tertiary function and just informative."

**Deal Team / Owner Team Concept**

- Deal Team is the unifying concept comprising three groupings:
  - **Owner Team** — sellers/principals
  - **Broker Team** — Lakebridge's deal team
  - **Buyer Team** — emerges once a buyer is selected (post-offer)
- These groupings drive who gets which emails

**Workflow Reality**

- Volume: **20 deals at peak, up to 50 max**
- Frequency: **2 new deals per month**
- Top pain point (per Chris's "Placentia" example): **sending out emails, follow-up calls, distributing updated information (new land plans), Q&A distribution to everyone**. Communication and distribution, not document generation, is the primary pain.

**Compliance and Data Handling**

- No client-imposed compliance requirements (no SOC 2, no data residency, no NDA-driven controls)
- No US-only data residency requirement
- Document/audit retention: **1 year or less**. Per Chris: "Not important to me. 1 year? Or not at all"

**Existing Tools**

- Email platform: **Outlook**
- Contact master: **Outlook contacts plus scattered Excel marketing lists** (will need consolidation)
- Existing document storage: **Dropbox**
- Dropbox handling: **Integrate by linking to existing folders, not replace.** Per Chris: "We will likely want to manually load the 'link' to the system."

**Notifications**

- Channel: **Email only** (no in-app notifications)
- Triggers: **5 days before, day of, and day after** scheduled email send dates. Chris frames these as reminders to himself to send, not as automated outbound — see Scope Decisions Pending for the implication.

**Scope Confirmation**

- Buyer logins: **Purely internal, no buyer logins**
- AI-drafted tagging: **Not needed** — Chris does not want AI-drafted tags on outputs
- Hybrid deliverables (CFD, Premium, Valuation, Entitlement Summary): **Default to templated; AI on demand**
- Forbidden phrasings/disclaimers for AI: **None**

**Templates Chris will email separately**

- Q&A File
- Marketing Report (buyer list with tiers)
- Summary of Offers Matrix
- Custom Underwriting File
- Standard email templates (Chris noted he wrote these out in Excel and will share)

**Documents with no template but consistent structure across deals**

- Entitlement Schedule
- CFD Analysis
- Premium Analysis
- Valuation
- Entitlement Summary

These can be templated based on the consistent structure Chris describes; no existing template file is needed.

---

### Outstanding Follow-ups (small, resolve by email)

These can be wrapped up without a full call:

1. **DNS management for lakebridgecap.com.** Chris answered "Not sure - need to check." Need confirmation of where DNS is registered and that he can add a CNAME record when needed in Phase 1. Also needed in Phase 2 for the Resend sender domain verification.
2. **Templates Chris said he'd email separately.** Six items: Q&A File, Marketing Report, SOO Matrix, Custom UW File, standard email templates (in Excel), and any others he finds. Block on receiving these before some Phase 2 templated outputs can be finalized.
3. **The "buyer database" question.** Chris is musing about a persistent buyer database with the four states (Green/Yellow/Red/Not Selected on Deal) but is concerned about "scope of Project to spiral into a huge Salesforce-like database of contacts." Wants easy upload from Excel. Decision for Phase 1 schema: build with builder/contact as separate entities (per his confirmed strawman). Tiers attach to a per-deal **deal_buyer** join table, so the same builder can have different tiers across deals. Excel upload gets implemented in Phase 1; persistent buyer master with cross-deal selection is a future enhancement, not in this build's scope.

---

### Resolved Scope Decisions (post-questionnaire conversation)

Three significant questions emerged from Chris's questionnaire responses. All resolved before Phase 1 began:

#### 1. Multi-user platform (resolved: yes, multi-user from launch)

Chris initially asked about scope reduction for a single-user version. Resolution: build multi-user from launch. Multi-tenancy stays structural (org_id on every entity) and Lakebridge launches with Chris + marketing coordinator as the initial users. Adding more users later is trivial; removing the foundation later is a rebuild. Auth via Clerk as planned.

#### 2. AI features (resolved: deferred to future engagement)

Chris's response that he is "not looking for this project to automate" SOO and OM, plus his closing comment about "decide if we are having this system do the LOI summary and SOO or just a check mark," led to scoping all AI features out of this build. The platform tracks workflow, manages contacts, generates templated documents, and sends templated emails. No LLM calls.

This is a clean phase boundary — AI work becomes a follow-up engagement after the workflow platform is in production and Chris is using it. By then he'll have stronger opinions about which AI deliverables actually save time vs. which sound nice but aren't worth the review burden.

Total timeline reduced from 8 weeks to approximately 7 weeks as a result.

#### 3. Outlook integration (resolved: not required; use Resend instead)

Chris's questionnaire suggested he wanted "AI to open Outlook and send emails." The conversation clarified this was a means, not the end — what he actually needs is **automated email sending from the platform**, which we already had planned via Resend. Direct Microsoft Graph API integration with Outlook is out of scope. The platform composes templated emails, the user reviews/edits, and sends via Resend. From-address uses a Lakebridge sender domain (configured in Resend with a DNS verification step).

---

### Open Architectural Question (not for client)

The relationship between Lakebridge Capital and Land Advisors Organization (LAO) remains unclear. LAO is a national land brokerage firm (founded 1987, acquired by Park Place Partners in 2020). Lakebridge appears to operate under the LAO brand for client-facing materials. Worth eventually surfacing with Chris, but does not block Phase 1:

- Are there LAO brand standards, IT policies, or compliance requirements the platform must follow?
- Does LAO have existing technology platforms Chris is supposed to be using?
- Who owns the deal data Chris generates (Lakebridge, LAO, both)?

The fact that Chris confirmed "Land Advisors Organization branding" for the platform UI suggests LAO is the dominant brand identity, but the underlying organizational structure is still ambiguous.

---

## Project Files

- `marketing-process-checklist.html` — Chris's working prototype (design reference)
- `Marketing_Process_Checklist.xlsx` — Chris's design notes / wireframe spreadsheet (referenced for hierarchical checklist structure, Issues List report layout, etc.)
- `Lakebridge_Proposal_v9.docx` — Client-facing proposal (current)
- `Lakebridge_Discovery_Questionnaire_v3.docx` — Word version of the questionnaire (sent to client; replaced by Google Form)
- `build_lakebridge_form.gs` — Apps Script that generates the Google Form version of the questionnaire
- `Lakebridge_Capital_-_Discovery_Questionnaire.csv` — Chris's completed responses (basis for Discovery Status section above)
- `Lakebridge_Platform_Plan_v9.docx` — Internal working plan
- `Lakebridge_Engagement_Letter_v1.docx` — Engagement letter template (placeholders for fee, dates, etc.)
- `Lakebridge_Account_Setup_Checklist_v1.docx` — Vendor account setup checklist for Chris

## Communication Patterns

- Trusted-advisor tone with Chris (already an existing relationship)
- Weekly 30-minute check-ins during the build
- Async written status updates between calls
- Phase reviews at end of each phase with explicit sign-off before moving on
- Change requests for any out-of-scope work
- Client testing built into each phase (2-3 days of active use per phase)

## Implementation Notes for Claude Code

When starting work:

1. **Read the prototype HTML carefully.** It's the design source of truth for the UI layout and interaction patterns. The Excel design notes inform the data structure (especially the hierarchical checklist).
2. **Hierarchical checklist, not flat.** Phase 1 items group under categories per the Excel structure. Don't follow the prototype's flat list.
3. **Multi-tenancy is structural, not UI.** Build `org_id` into every table and query from day one. Don't expose multi-org admin UI at launch. Single-tenant Lakebridge org at launch.
4. **No AI in this build.** All document generation is templated. No Anthropic SDK, no LLM calls anywhere in the application code, no `cache_control` headers, no AI-drafted tags. AI work is a future engagement.
5. **Default templated for hybrid deliverables.** CFD, Premium, Valuation, Entitlement Summary use templated narrative paragraphs with structured data substitution. No AI fallback in this build.
6. **Email via Resend, not Outlook.** The platform composes templated emails, the user reviews them in the UI, and the platform sends via the Resend API. No Microsoft Graph API integration. Sender domain configured in Resend (DNS verification step coordinated with Chris).
7. **Vendor accounts in Lakebridge's name.** Do not create accounts in Sean's name. Chris is working through the Account Setup Checklist. Note: Anthropic account is NOT needed for this build.
8. **Land Advisors branding on all generated client documents AND the platform UI.** Logo, address (100 Spectrum Center Drive Suite 1400, Irvine CA 92618), footer. Single brand throughout.
9. **Don't reproduce the prototype's localStorage approach.** All state goes to Postgres. No browser-local persistence beyond ephemeral UI state.
10. **Dropbox integration via links, not replacement.** Documents stored in R2 are platform documents. Existing Dropbox folders get linked to checklist items, not replaced. Manual link entry per Chris.
11. **Buyer tier states: Green, Yellow, Red, Not Selected on Deal.** Four states, not three. Per-deal, not persistent across deals (tiers attach to a per-deal `deal_buyer` join table, so the same builder can have different tiers across deals).
12. **Document statuses: Draft, Final.** Two states only.
13. **Document versioning: automatic, every save creates a version.**
14. **Document retention: 1 year is the working assumption.** Build with configurable retention; default to 365 days.
15. **Checklist dependencies: enforce, do not warn.** Block items until prerequisites are checked. Examples: "Send out OM / Blast" requires "Offering Memorandum" complete; "Send out Q&A File" requires "Coordinate a Q&A File" complete.
16. **Consultant roster has 11 roles** (the original 9 plus Architect and PSA Attorney). Each role can hold multiple firms split by buyer/seller side, and each firm can hold multiple individual contacts. Treat this as informative metadata, not a primary feature.
17. **Deal Team is the unifying concept** comprising Owner Team (sellers/principals), Broker Team (Lakebridge), and Buyer Team (post-selection). These groupings drive who gets which emails.
18. **Workflow assumption: 20 deals at peak, 50 max, 2 new deals per month.** The platform should handle this comfortably without optimization tricks.

## Recommended Phase 1 Sequence

For the first three weeks, work in this order:

**Day 1: Scaffold and ship to Vercel.** _(Completed 2026-04-30, except Vercel deploy — pending Lakebridge Vercel account setup.)_

- `npx create-next-app@latest` with App Router, TypeScript strict mode, Tailwind, ESLint, src/app structure → **Done** (Next 16.2.4, React 19.2.4, Tailwind v4, Turbopack)
- Initialize shadcn/ui and add commonly-needed components: Button, Card, Dialog, Input, Select, Table, Tabs, Toast, Form, Label, Textarea, Checkbox, Badge → **Done** (12 components installed; Toast = `sonner` in modern shadcn; Form skipped — modern shadcn no longer ships it as a registry component, will be added when first needed via react-hook-form)
- Set up Prettier with Tailwind plugin → **Done** (`.prettierrc.json`, `format` and `format:check` scripts)
- Connect repo to Vercel (Lakebridge org), confirm preview deploy works on a push → **Pending** (Lakebridge Vercel account in progress)

**Day 2: Tooling layer (no configuration yet).** _(Completed 2026-04-30.)_

- Install Drizzle ORM and drizzle-kit → **Done** (`drizzle-orm` runtime, `drizzle-kit` dev). Postgres driver: **`@neondatabase/serverless`** (Drizzle has first-class Neon support; works in both Node and Edge runtimes).
- Install Clerk's Next.js SDK (`@clerk/nextjs`) → **Done** (package only; Clerk init/middleware deferred until Lakebridge Clerk account is provisioned).
- Install Sentry for Next.js with the wizard → **Package installed** (`@sentry/nextjs`); **wizard deferred** until Lakebridge Sentry account is provisioned. Wizard requires an active org/project.
- Install `@t3-oss/env-nextjs` for environment variable schema → **Done** (also installed `zod` as the required peer).
- Install Resend SDK → **Done** (`resend`).
- Set up basic folder structure: `app/`, `components/`, `lib/`, `db/schema/`, `db/migrations/` → **Done**. `src/app/`, `src/components/ui/`, `src/lib/` already existed from scaffold; added `src/db/schema/` and `src/db/migrations/` (with `.gitkeep` placeholders until populated).
- Verify everything builds and lints clean → **Done**.

**Day 3: Connect Neon.** _(Prep done 2026-04-30; Neon connection pending Lakebridge Neon account.)_

- Create Neon project from your collaborator access (US East region, near Vercel) → **Pending** (waiting on Lakebridge Neon account)
- Pull connection string into `.env.local` and Vercel environment → **Pending**. `.env.local` exists with placeholder `DATABASE_URL`; swap to real value once Neon project is up.
- Configure Drizzle to point at Neon → **Done** (drizzle.config.ts at repo root, points at `process.env.DATABASE_URL` via dotenv-loaded `.env.local`)
- Run a hello-world migration to prove the connection → **Pending** (will be the first real migration after schema lands in Day 4-5)
- Set up the Drizzle migration workflow → **Done** (`db:generate`, `db:migrate`, `db:push`, `db:studio` npm scripts)

Also done as part of Day 3 prep:
- `src/lib/env.ts` — `@t3-oss/env-nextjs` schema with DATABASE_URL, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, RESEND_API_KEY (more vars added when those features are wired)
- `.env.example` — committed, documents all required env vars with placeholder values
- `.env.local` — gitignored, holds Sean's local placeholder values for development build to pass
- `src/db/index.ts` — Drizzle client wired to Neon HTTP driver
- Build and lint pass clean against placeholder env values

**Day 4-5: Core schema.** _(Schema written and migration generated 2026-04-30; migration applied to real DB pending Neon access.)_

All tables in `src/db/schema/` (one file per logical entity, plus `enums.ts` for shared enums). 14 tables total — slightly more than the original list because:
- `contacts` lives in `builders.ts` (related entity, kept colocated)
- `checklist_item_dependencies` is its own table (many-to-many: an item can depend on multiple prerequisites)

Tables shipped:

- `organizations` (Clerk org sync — `clerk_org_id`, name, slug)
- `users` (Clerk user sync — `clerk_user_id`, email, name, role enum: owner/broker/analyst/viewer)
- `deals` (org_id, name, units, city, state, type, status enum: phase_1..phase_4/closed/cancelled, priority enum, notes)
- `builders` (org_id, name, classification enum: private/public, notes)
- `contacts` (builder_id, first_name, last_name, title, email, phone, notes)
- `deal_buyers` (deal_id + builder_id unique join, tier enum: green/yellow/red/**not_selected**, lead_user_id, called_at, om_sent_at, comments)
- `checklist_categories` (deal_id, phase enum, name, sort_order) — hierarchical container
- `checklist_items` (category_id, name, description, optional, sort_order, completed, completed_at, completed_by, **external_link_url** + label for Dropbox links per CLAUDE.md note 10)
- `checklist_item_dependencies` (item_id, depends_on_item_id, composite PK) — many-to-many for prerequisite enforcement
- `qa_items` (deal_id, question, answer, approved, approved_at, approved_by)
- `issues` (deal_id, title, description, status enum: open/in_progress/resolved, priority enum: low/medium/high/urgent, assigned_user_id, identified_at, resolved_at)
- `consultants` (deal_id, role enum 11 values, side enum: buyer/seller, firm_name, contact info, notes — flat per CLAUDE.md note 16 "informative metadata, not a primary feature")
- `documents` (deal_id, name, type, version int, status enum: draft/final, r2_key, external_url, mime_type, size_bytes, uploaded_by, uploaded_at — `r2_key` and `external_url` both nullable to support platform-stored vs. linked)
- `audit_log` (org_id, user_id, action, entity_type, entity_id, before/after/metadata jsonb, created_at)

Conventions used across all tables:
- UUID primary keys with `gen_random_uuid()` defaults (Postgres 13+ built-in)
- `org_id` foreign key on every multi-tenant table with `onDelete: cascade`
- User foreign keys (completed_by, approved_by, assigned_user_id, etc.) use `onDelete: set null` so user deletion doesn't cascade-destroy historical records
- `deal_buyers.builder_id` uses `onDelete: restrict` — can't delete a builder that's actively in a deal
- All timestamps `with timezone`, `defaultNow()` on creation, `$onUpdate(() => new Date())` on `updated_at`
- snake_case column naming via Drizzle's `casing: "snake_case"` config — TypeScript code reads camelCase, DB reads snake_case
- Type exports per file: `export type X = typeof xTable.$inferSelect; export type NewX = typeof xTable.$inferInsert;`

Migration `src/db/migrations/0000_modern_dorian_gray.sql` generated locally. Will be applied to Neon as the first migration once Lakebridge Neon project is live.

**Indexes deliberately omitted at this stage.** At 20-50 deals scale, Postgres scans are fine without them. When real query patterns surface (or if perf ever lags), add indexes in a follow-up migration — start with `org_id` on hot tables.

Run migrations. Seed a single Lakebridge org and Chris's user for development. _(Pending Neon access.)_

**Day 6-7: Configure Clerk and build app shell.** _(App shell + deal selector built 2026-04-30; Clerk wiring partial, blocked on real keys.)_

- Configure Clerk for Lakebridge organization with email + Google sign-in → **Blocked** (Lakebridge Clerk account)
- Wire Clerk middleware to gate all routes except sign-in → **Partial** (`middleware.ts` exists with `clerkMiddleware()` passthrough; no `auth.protect()` calls until real keys land)
- Sync Clerk users to local users table on sign-in (webhook) → **Blocked** (needs Clerk webhooks)
- Build app shell: sidebar nav, top header, main content area → **Done**
  - `src/app/(app)/layout.tsx` — priority ribbon + sidebar/main flex container
  - `src/components/layout/priority-ribbon.tsx` — top dark navy bar showing pinned high-priority deals (matches prototype's amber-on-navy aesthetic)
  - `src/components/layout/sidebar.tsx` — 260px white sidebar with Land Advisors logo, "Deals" header, deal list with name + city/state + checklist progress bar + priority star
  - `src/components/brand/logo.tsx` — Land Advisors logo SVG (layered mountain in dark ink box + wordmark)
- Build deal selector that loads deals from DB → **Done**. Sidebar queries deals + checklist progress aggregated from real Postgres rows.
- Confirm sign-in flow works end-to-end → **Deferred** (needs real Clerk keys)

Also done as part of Day 6-7:
- `src/app/(app)/page.tsx` — empty state when no deal is selected ("No deal selected — Pick a deal from the sidebar...")
- `src/app/(app)/deals/[id]/page.tsx` — deal detail view with deal header (name, status badge, priority star, location/counts subtitle), overall progress bar, and 5-tab nav (Checklist, Contacts, Q&A, Issues, Consultants)
- `src/app/(app)/deals/[id]/deal-tabs.tsx` — client component for tab switching (matches prototype's underlined-tab pattern with count badges)
- `src/app/(app)/deals/[id]/views/checklist-view.tsx` — phase-grouped checklist with category subheaders, completed-item styling, optional badges, color-coded phase headers (navy/green/purple/orange per prototype)
- Other tabs render "Coming in week 2-3" placeholders for now
- `src/lib/auth/get-current-org.ts` — placeholder helper that returns the first org in the DB; will be replaced with auth-context lookup when Clerk is wired
- `src/db/seed.ts` — seeds Lakebridge org, Chris's user, 5 builders + 3 contacts, 2 deals (Riverside Estates Phase 2 high-priority + Lakeview Heights), 6 deal_buyers, full Phase 1 hierarchical checklist (5 categories, 14 items per deal, 6 marked complete on Riverside), 2 Q&A items, 2 issues, 2 consultants
- `db:seed` npm script using `tsx --env-file=.env.local` (Node's native env-file flag avoids ES module hoisting issues with `dotenv.config()`)
- Brand CSS vars added to `globals.css`: `--color-brand-bg`, `--color-brand-ink`, `--color-brand-navy`, `--color-brand-accent`, `--color-brand-blue`, `--color-phase-1` through `--color-phase-4`, `--color-tier-green/yellow/red`. Tailwind v4 generates utility classes (`bg-brand-bg`, `text-brand-accent`, etc.) from these.
- Switched font from Geist to Inter (matches prototype)
- ClerkProvider intentionally not wrapping the root layout yet — placeholder `pk_test_placeholder` would throw at Clerk SDK init. Documented inline in `src/app/layout.tsx` with the snippet to drop in once real keys arrive.

By end of week 1: logged-in user, org context active, empty deal pages, all infrastructure in place. _(Auth deferred; everything else achieved.)_

**Week 2-3: Build prototype-equivalent functionality.**

- Deal CRUD (create, edit, delete, list)
- Hierarchical checklist UI matching Excel structure
- Buyer/contact management with tier tagging
- Q&A workflow (add, edit, approve)
- Issues tracker
- Consultant roster
- All tied to real Postgres, faithful to prototype's UX

End of Phase 1: hosted multi-user version of the prototype, ready for Chris's testing.

## Working with This Document

Treat CLAUDE.md as a living document. When you finish a phase or make a decision that affects scope, update the relevant section. The Discovery Status section should evolve from "Outstanding Follow-ups" toward "Resolved Scope Decisions" as items get answered. The Phased Build Plan should reflect what was actually built, not just what was planned.

When in doubt about a design decision, default to: (1) what the prototype shows, (2) what the Excel shows, (3) what the implementation notes above say. If those three conflict, ask Sean.
