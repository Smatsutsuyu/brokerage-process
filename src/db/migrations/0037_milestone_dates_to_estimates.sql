-- Re-home every milestone date from the actual column onto the estimate.
--
-- Migration 0035 added estimated_date and left tracked_date meaning
-- ACTUAL, on the reading that dates already entered were real dates
-- recorded as things happened. That read was wrong: the dates on file are
-- projections, so they belong in estimated_date and the actual column
-- should start empty and fill in as milestones land.
--
-- Guarded on estimated_date IS NULL, which does two things. It makes the
-- statement idempotent, since a second run finds tracked_date already
-- cleared. And it protects the one row that legitimately carries BOTH
-- dates: someone used the new estimate field between the 0035 deploy and
-- this migration, and a blanket move would have overwritten their
-- estimate with the actual and destroyed the very comparison the two
-- fields exist to show. A row holding both is already in the intended
-- shape and is deliberately left alone.
--
-- Unscoped by org: single-tenant today, and every affected row belongs to
-- the one Lakebridge org. Stated explicitly because it stops holding the
-- moment a second org is onboarded.
UPDATE "checklist_items"
SET "estimated_date" = "tracked_date",
    "tracked_date" = NULL
WHERE "tracked_date" IS NOT NULL
  AND "estimated_date" IS NULL;
