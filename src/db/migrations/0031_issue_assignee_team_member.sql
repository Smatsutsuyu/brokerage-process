ALTER TABLE "issues" ADD COLUMN "assignee_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_team_member_id_deal_team_members_id_fk" FOREIGN KEY ("assignee_team_member_id") REFERENCES "public"."deal_team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: for each existing issue whose assigned_user_id points at a user
-- who is also a Deal Team member (via deal_team_members.user_id on this
-- deal), populate the new assignee_team_member_id with that team row's id.
-- Issues assigned to a user not currently rostered on the Deal Team fall
-- through to NULL (become unassigned) — acceptable since removing someone
-- from the Deal Team is a routine action and the FK cascade already treats
-- that as "downgrade to unassigned". Idempotent: after DROP COLUMN the
-- assigned_user_id source is gone, so re-running is a no-op.
--
-- Correlated subquery with a stable ORDER BY: a user can sit on multiple
-- sub-teams of the same deal (schema permits it — no UNIQUE (deal_id,
-- user_id) on deal_team_members), so a plain UPDATE ... FROM would pick
-- an arbitrary match. Prefer the Broker Team row first because
-- assigned_user_id historically only held Lakebridge users acting as the
-- broker on a deal; falling back to Owner then Buyer, then earlier
-- sort_order, then earlier created_at for full determinism.
UPDATE "issues" SET "assignee_team_member_id" = (
  SELECT dtm."id"
  FROM "deal_team_members" dtm
  WHERE dtm."deal_id" = "issues"."deal_id"
    AND dtm."user_id" = "issues"."assigned_user_id"
  ORDER BY
    CASE dtm."team"
      WHEN 'broker' THEN 0
      WHEN 'owner'  THEN 1
      WHEN 'buyer'  THEN 2
    END,
    dtm."sort_order",
    dtm."created_at"
  LIMIT 1
)
WHERE "issues"."assigned_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" DROP CONSTRAINT "issues_assigned_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "assigned_user_id";