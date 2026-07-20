# Features

The Land Advisors Portal is a multi-user deal management platform for Lakebridge Capital and Land Advisors brokers. It tracks each land brokerage deal through a four-phase lifecycle, manages the buyer contacts on each deal, generates Land-Advisors-branded PDFs (Marketing Report, Q&A File, Due Diligence Tracking), and sends templated email blasts through Resend.

What this app does not do: no in-app notifications (alerts go to your email inbox), no Outlook or calendar integration, no AI drafting, parsing, or summarizing. Document generation is templated and deterministic. AI features are deferred to a future engagement.

---

## Sign in and your profile

Sign in with email and password at `/sign-in`. There is no self-service "forgot password" flow yet, so if you lock yourself out, ask an owner to reset you from Admin > Members. An owner-triggered reset hands you a fresh temporary password and forces you to pick your own on next sign-in via a `/set-password` prompt before you can enter the app.

Your profile lives at `/profile`. From there you can edit your display name and phone, change your password (minimum 8 characters; you stay signed in on this device), and sign out.

Owners get an extra Feedback notifications card on the profile with four email subscriptions:

1. Every time new feedback is submitted (org-wide feed).
2. When someone replies on a thread you have commented on.
3. When someone comments on feedback you created.
4. When the status changes on feedback you created.

Toggles save on click. Non-owners do not see this card.

---

## Browsing deals (the sidebar)

The left sidebar is always present once you are signed in. The top shows the Land Advisors logo and a "New Deal" button. Below that is the deal list. Each deal row shows:

- A star if the deal is high priority.
- The deal name, city, and state.
- A small progress bar with completed-item count (e.g. `12/47`).
- A phase chip (Phase 1-4 or Complete), inferred from the lowest phase that still has unchecked items.

Hover any deal row to reveal small up and down chevrons on the right edge. Click to reorder. The ordering is per-user, so each member arranges their own working list without affecting anyone else.

Above the sidebar, a dark navy ribbon spans the top of the app and pins every deal flagged as high priority in your org. Click any pinned deal to jump to it. If nothing is starred, the ribbon shows "Star a deal to pin it here."

Below the deal list, the sidebar links to two org-wide directories (Builders, Contacts) and, for owners only, an Admin section with Members and Feedback. Your name and role sit at the bottom; clicking opens your profile.

---

## Working a deal (the deal page tabs)

Click a deal in the sidebar to open it. The deal page has a header (deal name, status, priority star, location, units, type) and six tabs. Each tab is a workspace for one slice of the deal.

### Checklist

The centerpiece of the workflow. Items are grouped into four phases matching the deal lifecycle (Phase 1 going-to-market, Phase 2 marketing process, Phase 3 summary of offers, Phase 4 due diligence). Within each phase, items group by category. When every item in a phase is complete, the section auto-collapses.

Every item supports a completion checkbox (with timestamp and who completed it), inline notes, file attachments stored on Vercel Blob (replacing a file auto-versions the prior copy), and an external link slot for Dropbox folders or any URL.

Some items have extra affordances:

- Phase 4 milestone items (LOI Signed, PSA Effective, Cost to Complete drafts, Investment Committee Approval, Waive Feasibility, Closing Date) get a date chip on the row so you can record projected or actual dates.
- Some items have an "Open [Tab]" jump button when their data lives in a sibling tab. "Create Consultant Roster" jumps to Consultants; "Complete Due Diligence" jumps to Issues.
- Some items have inline action buttons that share behavior with the relevant tab. Wired and working today: Send OM Blast on the OM Blast row, Send Q&A File on the Q&A File row, Share Market Study on its row, Send CTC on the Phase 1 Cost to Complete (CTC) row, Send to Deal Team on Share Due Diligence Material and on Complete Due Diligence, Marketing Report PDF on its row, Send Marketing Report on the Phase 2 row of the same name (two-step modal: preview the freshly-generated PDF, then compose the email to the Owner Team with a CC picker), and the inline PSA Attorney picker on Determine PSA Attorney. CFD Analysis, Premium Analysis, Valuation, Entitlement Schedule, Entitlement Summary, Custom Underwriting File, and Compiled Package still surface "Coming soon" placeholder toasts and are scoped for a future phase.

### Contacts

Manage the buyer list for this deal. Four layouts ship as first-class options, selectable from a picker at the top of the tab: **Cards** (default, grouped by tier with per-builder metadata), **Pane** (split view), **Grouped** (accordion by builder), **Compact** (dense table). The URL carries the selection via `?layout=b|c|d` so a specific layout is bookmarkable and shareable; the picker updates the URL in place without adding a history entry. Cards is the canonical daily-driver; the others are alternate arrangements of the same data.

The Cards layout groups buyers by tier (Interested / Evaluating / Pass / Not Selected) with filter chips at the top to narrow by tier.

For each builder card you can:

- Set the tier (Green / Yellow / Red / Not Selected).
- Assign a Lead (which broker owns the relationship).
- Tick the four per-builder checkboxes: Called, Confi (signed), OM (sent), Offer (received).
- Add a free-text comment that flows into the Marketing Report PDF.
- Add, edit, or remove contacts within the builder. Each contact has a bell icon to toggle "receives communication." Anyone toggled off is excluded from email blasts to that builder.
- Pick an existing org contact to attach, or add a brand-new contact.
- Remove the builder from this deal.

The toolbar above the cards exposes deal-level actions: download the Marketing Report PDF, start an OM blast.

### Q&A

Capture questions from buyers and your drafted answers. Add, edit, and approve items. Approval locks the item so it does not change after distribution; one-click "approve all" handles the common batch case.

Once items are approved, Generate PDF renders them into a Land-Advisors-branded Q&A File. Send Q&A emails that PDF to selected recipients via Resend.

### Issues

A living issues tracker for due diligence. Add an issue with a title, description, priority (low / medium / high / urgent), assignee, status (open / in-progress / resolved), and identified/resolved dates. The assignee picker lists every Deal Team member on this deal across all three sub-teams (Owner / Broker / Buyer), regardless of identity source — an org user, an external contact, or a free-text name all show up as valid assignees. An assignee since removed from the team still appears in the picker so editing an existing issue doesn't drop them. The tab badge shows the open count. Click Generate PDF to open the Due Diligence Tracking report (combined milestone dates + issues + deal team + consultants) for your DD calls.

### Consultants

Per-deal consultant roster covering 13 roles (Landscape Architect, Civil Engineer, Soils Engineer, Cost to Complete, HOA, Dry Utility, Phase 1, Land Use, Biologist, Architect, PSA Attorney, Title Consultant, Escrow Consultant). Each role can hold multiple firms split by buyer or seller side, with one or more contacts per firm. Informative metadata for the deal team; does not drive automation by itself.

### Teams

The Teams tab unifies the Deal Team into three groupings:

- Owner Team: sellers and principals on this deal.
- Broker Team: everyone running point for Lakebridge or Land Advisors. Pick from org users; outside cobrokers should be added via Admin > Members first.
- Buyer Team: the chosen buyer's contacts, picked from contacts already on the deal.

Each member has an Include in emails toggle. Inclusion drives the recipient list when you use the Send to Deal Team buttons (for example, sharing DD material). Members can be real users, existing contacts on the deal, or free-text entries for someone who has no platform record yet.

---

## Generating documents (the PDFs)

Three Land-Advisors-branded PDFs are built into the app. All three open in a new browser tab as inline PDFs so you can preview before forwarding.

- Marketing Report. Builder list grouped by tier with per-builder comments. Generated from the Contacts tab toolbar (button labeled "Marketing Report") or the Marketing Report row on the Phase 1 checklist. This is what you send to ownership for status updates. The Contacts tab also has a "Send Marketing Report" button next to it that runs the same two-step PDF-preview-then-email flow as the Phase 2 checklist row (delivers to the Owner Team with co-brokers CC'd).
- Q&A File. Approved Q&A items rendered as a clean branded document. Generated from the Q&A tab or the Phase 2 "Q&A File" checklist row.
- Due Diligence Tracking. Combined PDF for the bi-weekly DD call: the 7 milestone dates from the Phase 4 checklist, current issues grouped by status (no summary stats), the full Deal Team (Owner / Broker / Buyer subteams), and the consultant roster. Generated from the Issues tab toolbar or the Phase 4 "Complete Due Diligence" row.

The fonts and logo are baked in so the output matches Land Advisors brand standards without any setup.

---

## Sending email blasts

Launch a blast from two places: the toolbar on the Contacts tab, or the relevant Phase 2 checklist row (Send out OM Blast, Q&A File, Confidentiality Agreement, Share Market Study, Share Marketing Due Diligence Folder, 1-week notice, Day-of Reminder, Follow up Missing Offers).

A two-step modal opens (both steps share one window — clicking Next swaps the body in place rather than stacking a second modal):

- **Step 1, Recipients.** Filter by tier (Green / Yellow / Red) and by lead user. The recipient preview groups contacts under their builder and tints each group's background with the builder's tier color (green / yellow / red / gray) so you can see at a glance which tier each builder belongs to when several tiers are selected. Each emailable contact has a checkbox (defaulted to checked) — uncheck any to skip, or use the builder-level select-all / none. Anyone toggled off via the Contacts-tab bell icon is already excluded; contacts without an email show but can't be selected. The "Next" button counts only checked emails.
- **Step 2, Preview & send.** Review and edit the subject and body once and the change applies to every per-builder email. Pick which attachments to include (for OM blasts, the OM file pre-selected from the Phase 1 row). The CC picker is grouped under three sections (**Owner Team** → **Broker Team** → **Org Members**); pick any names to add. On the OM blast specifically, every Broker Team member is pre-checked on each builder so the Broker Team gets CC'd on the OM by default (you can uncheck individuals before sending if needed). Per-builder Org Member CC selections persist across blasts; Owner / Broker picks are per-send. Click "Back" to return to Step 1 with all filter and checkbox state intact. Click Send to deliver.

### OM blast tracking

The "Send OM blast" button has additional safeguards because the OM is the largest single piece of buyer-facing content and re-sending it accidentally looks sloppy. Several behaviors fire only on the OM blast (other blasts are unaffected):

- **No OM, no blast.** Clicking "Send OM blast" first verifies an OM file is uploaded to the Phase 1 Offering Memorandum row. If the file is missing (or the OM row itself doesn't exist on this deal), a red bubble drops below the button with the next step ("Upload the OM file to the Phase 1 row first, then send") and the composer does not open.
- **Offering Date soft check.** Once the OM file check passes, the platform looks for the deal's Offering Date milestone. If it's set, the body includes a line: "Offers on this Project are due on Friday, May 29, 2026." If it's not set, a confirmation dialog asks whether to send anyway with that line dropped. Pick "Set date first" to cancel and go set the Phase 2 Offering Date row; pick "Send without date" to proceed with the no-date template.
- **Warn on prior sends.** Step 1's recipient list shows an amber "OM sent MMM D" chip next to any builder you've already OM-blasted on this deal, and Step 2's per-builder preview shows the same warning as a banner above the email body. The flag comes from each builder's "OM Sent" checkbox on the Contacts tab.
- **Auto-uncheck + override.** Builders with the "OM Sent" flag set are unchecked by default in the recipient list every time you reopen the modal, so you don't re-send by accident. You can still check them back on individually to override; that override holds while the modal stays open (filter changes don't wipe it).
- **Auto-mark after send.** After a successful blast, every builder the OM actually reached gets their "OM Sent" checkbox flipped to checked automatically (with the timestamp from this moment). The contacts tab and the next OM blast both pick up the new state right away.

### 1-week offers-due notice gate

The Phase 2 "Send 1-week notice" button uses the Offering Date milestone too, but as a hard gate rather than a soft confirm: the body contains "Offers are due in a week on {{dueDate}}", which makes no sense without a date. Clicking the button before the Offering Date is set surfaces an inline red bubble pointing at the Phase 2 row; once the date is set, click again and the composer opens with the date substituted in.

### Attachment gates on document-share row buttons

Some row buttons exist solely to ship a document and refuse to open the composer if there's nothing to send. The check happens on click; if it fails, a red bubble drops below the button with a short explanation. Click the bubble or wait six seconds to dismiss.

- **Send OM blast** requires an uploaded OM file on the Phase 1 Offering Memorandum row (see "OM blast tracking" above for the full set of guardrails).
- **Send Market Study** requires an uploaded file on the row. A Dropbox link alone won't satisfy this gate — the recipient needs the actual document attached.
- **Send CTC** (Cost to Complete row) requires an uploaded file on the row, same as Send Market Study.
- **Send DD Folder** (Share Marketing Due Diligence Folder row) accepts either a file or a link, since these are usually shared as a Dropbox / SharePoint folder URL.

In all three cases, drop the file or link onto the checklist row via its universal attachment / link affordance, then click Send again.

### Sender + delivery

Emails send through Resend on the verified `landadvisors.com` domain. The "From:" line is `Chris Shiota <cshiota@landadvisors.com>` for every client-facing send. Each send BCCs the sender's address so a copy lands in your Inbox — Resend doesn't post to Outlook Sent Items, so the BCC is how you keep a mailbox record. An Outlook rule can route these BCC copies into a "Platform sends" folder if you want a Sent-Items-style view.

There is no in-app inbox or reply tracking. Recipients reply directly to `cshiota@landadvisors.com`; replies land in Chris's Outlook as usual.

---

## Contacts and Builders directories

These two sidebar links surface org-wide views, independent of any deal.

- `/contacts`. Every buyer-side contact in your org, sortable and searchable, showing builder affiliation and which deals each contact is on. Use "Import from Excel" to bulk-load contacts from a marketing list. You can add or edit contacts standalone (not tied to a builder) or under a specific builder.
- `/builders`. Every builder in your org, with classification (private / public), contact count, and the deals each builder is on. Edit, add, or remove builders.

Both directories are the master list. Per-deal contact attachment happens from the Contacts tab on a deal.

---

## Submitting in-app feedback

Any user can submit feedback. Two affordances: a floating button in the bottom corner of every page, and small message-bubble icons attached to specific sections (clicking one pre-tags the feedback with that section).

The form lets you set severity (Nit / Suggestion / Bug / Blocker), write a comment, and attach files under 10 MB each. Submissions auto-include the current page path and deployed commit SHA so reviewers can correlate against shipped code. Keep the conversation going by replying on the thread (under Admin > Feedback if you are an owner, or via email notifications if you have subscribed).

---

## Admin tools (owner-only)

Owners get two extra sidebar links under Admin.

### Members (`/admin/members`)

Invite users, change their role (Owner / Broker / Analyst / Viewer), and disable or remove access. Disabling a user keeps the historical record (their name still shows on past completed checklist items, comments, etc.) but blocks sign-in. This is where outside cobrokers get added before the Teams tab can include them.

Each row also has a **Reset PW** button. Click it, pick (or regen) a temporary password, and confirm. The modal shows the temp password once with a Copy button so you can share it out-of-band. On the target's next sign-in, the app intercepts them at `/set-password` and forces them to pick their own new password before any other route loads. Any active session that member had at the moment of reset is invalidated too, so a stale browser tab can't slip past the gate. Useful for the "we set up a broker account for the deal team but never handed the credentials over" case: reset gives you a fresh password to hand out, and the new user still ends up choosing something you never see.

### Feedback (`/admin/feedback`)

Triage every piece of feedback submitted across the org. For each item you see who submitted it, when, the page they were on, the deployed commit SHA, severity, status, and any attachments. Move the status through the workflow (New > Reviewed > Actioned > Complete, or Won't Fix), reply on the comment thread, and filter by status, severity, or section. A Send Test Email button lets you fire a test feedback notification to yourself to confirm email delivery is healthy.

---

## Concepts worth knowing

A short glossary for terms you will see throughout the app.

- Tier. Per-deal interest level for a buyer. Green is interested, Yellow is evaluating, Red is passed, Not Selected means the builder is on the deal but has not been classified yet. Tiers are per-deal, so the same builder can be Green on one deal and Red on another.
- Deal Team. The union of three groupings on a deal: Owner Team (sellers/principals), Broker Team (Lakebridge/LAO staff running point), and Buyer Team (the chosen buyer's contacts once an offer is selected). The Teams tab drives who receives deal team email sends.
- Confi. Confidentiality Agreement. The per-builder "Confi" checkbox on the Contacts tab tracks whether the builder has signed.
- OM. Offering Memorandum. The marketing document for a deal; sits on the Phase 1 Underwriting & OM checklist as an upload and gets attached to the Phase 2 OM Blast.
- PSA. Purchase and Sale Agreement. Drafted by the chosen PSA Attorney; kicked off in Phase 4.
- DD. Due Diligence. Phase 4 of the deal lifecycle.
- CTC. Cost to Complete. The infrastructure cost analysis that drives the final purchase price; one of the Phase 1 third-party marketing reports and a key Phase 4 milestone.
- LOI. Letter of Intent. Signed by the chosen buyer at the end of Phase 3 and tracked as a Phase 4 milestone date.
- SOO. Summary of Offers. The matrix comparing buyer offers side by side; lives in Phase 3.

For the deeper engagement context (why the platform exists, the build phases, the vendor stack, the scope boundaries), see `CLAUDE.md` in the repo root.
