# Rollback runbook: 2026-07-15 issue-assignee migration (0031)

**Migration commit:** `24c870f` — `refactor(issues): assignee references deal_team_members instead of users`

Use this if the migration or the surrounding code changes cause a problem in production and reverting is faster than fixing forward. Read the "before you roll back" section first — some symptoms have cheaper fixes.

---

## Before you roll back

**Symptoms that DO warrant rollback:**
- Vercel deploy fails during `drizzle-kit migrate` (schema in an inconsistent state — no data loss yet since the migration is transactional per statement, but the app won't deploy).
- Issues tab crashes on load with a database error.
- DD Tracking PDF fails to render.
- The assignee picker is empty for every deal (would indicate the polymorphic query is broken).
- Cross-tenant name leak actually observed (would indicate the IDOR fixes didn't take — very unlikely, verify workflow confirmed).

**Symptoms that do NOT warrant rollback:**
- Picker shows unexpected people — likely a Deal Team roster issue, not a migration bug. Investigate the roster on the affected deal via the Teams tab before rolling back.
- Old issues show "Unassigned" that used to show a name — the backfill left them null because the assigned user wasn't on the Deal Team roster at migration time. Fix forward by re-assigning in the UI (adds a proper Deal Team member first). Rolling back would restore the same broken FK behavior.
- Chris asks for a different assignee-picker behavior — fix forward.

**Data-loss awareness:** if any issue was newly assigned to a **contact-based** or **free-text** Deal Team member after this migration deployed, rolling back loses that assignment (the pre-migration schema only accepted user FKs, so those assignees can't survive the revert). Query first to see if this applies:

```sql
SELECT COUNT(*) FROM issues i
JOIN deal_team_members dtm ON dtm.id = i.assignee_team_member_id
WHERE dtm.user_id IS NULL;
```

If that count is > 0, the rollback will null those assignments. Decide if that's acceptable before proceeding.

---

## Rollback procedure

Two artifacts land in one commit and get pushed together:

1. A reverse migration file that re-creates `assigned_user_id` and back-fills it from the current state.
2. A `git revert` of `24c870f` (undoes all the app-code and doc changes).

The reverse migration file is authored below — copy the four blocks verbatim into the four file paths shown.

### Step 1: Create the reverse migration file

Write this to `src/db/migrations/0032_revert_issue_assignee.sql`:

```sql
ALTER TABLE "issues" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Reverse-backfill: for each issue whose assignee_team_member_id points at
-- a Deal Team member with a linked user, populate assigned_user_id with
-- that user id. Contact-based and free-text assignees are lost (the
-- pre-migration schema only accepted user FKs). Idempotent: after DROP
-- COLUMN the assignee_team_member_id source is gone, so re-running is
-- a no-op.
UPDATE "issues" SET "assigned_user_id" = dtm."user_id"
FROM "deal_team_members" dtm
WHERE dtm."id" = "issues"."assignee_team_member_id"
  AND dtm."user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" DROP CONSTRAINT "issues_assignee_team_member_id_deal_team_members_id_fk";--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "assignee_team_member_id";
```

### Step 2: Create the reverse snapshot

Write this to `src/db/migrations/meta/0032_snapshot.json`. It's identical to `0031_snapshot.json` **except for** three surgical changes: swap the id/prevId chain, restore `assigned_user_id` in the `issues.columns` block (removing `assignee_team_member_id`), and restore the old FK definition in `issues.foreignKeys` (removing the new one).

The cleanest way to produce it: start from `0030_snapshot.json` (which already has the pre-migration shape), then update its `id` and `prevId` fields:

```bash
python << 'EOF'
import json
with open('src/db/migrations/meta/0030_snapshot.json') as f:
    snap = json.load(f)
# Fresh id; prevId points at 0031's id (chain: 0030 -> 0031 -> 0032)
snap['id'] = '63c5c433-c56c-4eec-8ac7-bb34ce401f3d'
snap['prevId'] = '327f2c19-9028-46f8-a2c2-792d782238c3'
with open('src/db/migrations/meta/0032_snapshot.json', 'w') as f:
    json.dump(snap, f, indent=2)
print("Wrote 0032_snapshot.json")
EOF
```

### Step 3: Append the journal entry

Add this entry to `src/db/migrations/meta/_journal.json`'s `entries` array (bump the `when` timestamp if you're rolling back much later):

```json
{
  "idx": 32,
  "version": "7",
  "when": 1784539819954,
  "tag": "0032_revert_issue_assignee",
  "breakpoints": true
}
```

### Step 4: Revert the code

```bash
git revert 24c870f --no-edit
```

This regenerates all the pre-migration source files (schema, actions, views, docs). It also reverts the migration files from step 1-3 — that's a problem, so we have to un-revert those parts:

```bash
# The revert removed 0031's files AND our new 0032 files. Re-add 0032 only.
git checkout HEAD -- src/db/migrations/0032_revert_issue_assignee.sql \
                     src/db/migrations/meta/0032_snapshot.json \
                     src/db/migrations/meta/_journal.json
git add src/db/migrations/0032_revert_issue_assignee.sql \
        src/db/migrations/meta/0032_snapshot.json \
        src/db/migrations/meta/_journal.json
```

Actually there's a simpler ordering that avoids the revert-clobbers-migration issue: **do the revert first, THEN author the migration files on top**. Revised order:

```bash
git revert 24c870f --no-edit
# Now write the three files from steps 1-3 above (they land on top of the revert)
git add src/db/migrations/0032_revert_issue_assignee.sql \
        src/db/migrations/meta/0032_snapshot.json \
        src/db/migrations/meta/_journal.json
```

### Step 5: Commit + push together

```bash
git commit --amend --no-edit
git push
```

The amend folds the migration into the revert commit so Vercel gets one atomic deploy: reverse migration runs, then app code deploys with the old schema shape.

---

## Post-rollback verification

Once Vercel finishes deploying:

1. **DB shape:** `psql <prod> -c "\d issues"` — should show `assigned_user_id`, no `assignee_team_member_id`.
2. **Issues tab loads** on a deal that had assignees.
3. **DD Tracking PDF renders.**
4. **Assignee picker** shows the org's users (pre-migration behavior).
5. **Historical assignments preserved** for issues that were assigned to a user-linked dtm (the reverse backfill). Contact/free-text assignees are `NULL` (unavoidable).

---

## What the rollback does NOT restore

- `assigned_user_id` values on issues that were assigned to a **contact-based or free-text** Deal Team member between the forward migration deploying and the rollback deploying. These end up NULL. Re-assign via the UI.
- The `assigneeTeamMemberId` type/name in the codebase — you'd be back to `assignedUserId` everywhere. Not an issue since we're going back to the old code state anyway.
- The reusable `src/lib/deal-team-name.ts` helper — the revert removes it. If any future code you want to keep depends on it, extract it before reverting.
- Backlog entry pointing at `dd-tracking + getDealTeamRecipients` cleanup — the revert removes that too. Re-add if you still want the follow-up on the list.

---

## Once rolled back, then what

Fix forward from the pre-migration state. Options:

- **Revisit the design.** The core tension is that the assignee is display-only but the schema treats it as an FK. If the polymorphic FK approach failed for a reason worth understanding, consider the alternate (`assigneeName text` denormalized) or accept the "all-org-users" picker as good-enough.
- **Retry the migration** with the fix. Re-generate the migration under a new number (0033+) once the underlying issue is understood.
- **Delete this runbook** if you're confident you won't retry (or leave it as an audit trail of what didn't work).
