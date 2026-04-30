# References

Client-supplied source materials for the Lakebridge Capital build. Two categories:

## Authoritative design sources

The code is built against these. When the platform's behavior, structure, or content needs to match "what Chris wants," these files are the source of truth (in addition to CLAUDE.md, which captures the resolved scope decisions).

- **`marketing-process-checklist.html`** — Chris's working HTML prototype. The UI source of truth. Read this carefully before building any UI. (Note: prototype uses a flat checklist; the platform uses the Excel's hierarchical structure instead. Per CLAUDE.md, "Excel wins on data structure, HTML wins on UI layout.")
- **`Marketing Process Checklist.xlsx`** — wireframe / design notes spreadsheet. Source of truth for the hierarchical checklist structure (Phase 1 categories → items), the Issues List report layout, and other data-shape decisions.
- **`Lakebridge Capital - Discovery Questionnaire.csv`** — Chris's completed responses to the discovery questionnaire (2026-04-28). The settled scope decisions in CLAUDE.md's "Discovery Status" section derive from this file. Useful when a question arises about why a particular decision was made.

## Historical / contextual

Helpful background. Not a build target — don't write code that depends on these.

- **`Lakebridge_Discovery_Questionnaire.docx`** — original Word version of the questionnaire (replaced by a Google Form for Chris's actual responses; the CSV is the version of record).
- **`Lakebridge_Platform_Plan.docx`** — internal working plan from the proposal phase. Largely superseded by CLAUDE.md.
- **`Lakebridge_Proposal.docx`** + **`Lakebridge_Proposal.pdf`** — client-facing proposal (engagement scope, pricing, timeline).
- **`Lakebridge_Account_Setup_Checklist.docx`** + **`Lakebridge_Account_Setup_Checklist.pdf`** — vendor account setup tracker Chris is working through (Vercel, Neon, Cloudflare, Clerk, Resend, Sentry).

## Updating these

If Chris sends a new version of the prototype HTML or the Excel, replace the file and commit so the diff is visible. For business docs that go through frequent revisions (proposal, etc.), updates are optional — they're here for context, not for diffing.
