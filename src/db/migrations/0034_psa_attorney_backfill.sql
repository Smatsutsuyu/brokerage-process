-- Move the legacy deal-level PSA attorney onto the consultant roster,
-- which is now the single source of truth for who the attorney is.
--
-- ADDITIVE ONLY. deals.psa_attorney_name / psa_attorney_firm survive this
-- migration and are dropped in a later one, once this has been confirmed
-- in production. deals.psa_drafting is NOT going anywhere: whose counsel
-- holds the pen is a fact about the transaction, not an attribute of a
-- firm, and it is answered on a Phase 1 row months before counsel exists.
--
-- WHY THIS SHIPS WITH THE READ CHANGE RATHER THAN AFTER IT. The same
-- deploy stops reading the legacy columns. Without this backfill in the
-- same migration, a deal whose attorney was only ever recorded in those
-- columns would silently show "no attorney on the roster yet" until a
-- later deploy. A production dry-run found exactly two such deals, so
-- the gap was real rather than theoretical.
--
-- IDEMPOTENT via the NOT EXISTS guard. A deal that already has a
-- psa_attorney consultant keeps it and is skipped, so re-running is a
-- no-op and the roster row always wins: it is the decided source of
-- truth and, unlike the deal columns, it can hold an email address.
--
-- firm_name is NOT NULL, so it falls back to the attorney name on rows
-- where only a name was recorded. side is NOT NULL and is DERIVED from
-- psa_drafting rather than guessed; every affected deal in production has
-- it set. NULL and 'na' fall to 'seller', the side the brokerage
-- represents.
--
-- contact_email is deliberately left NULL. The legacy columns never held
-- an address, and inventing one would be worse than an empty field: the
-- Phase 4 kickoff send refuses to open without a valid address and points
-- the user at the Consultants tab, which is the correct prompt.
--
-- Unscoped by org. Single-tenant today and every affected row belongs to
-- the one Lakebridge org. Stated explicitly because it stops holding the
-- moment a second org is onboarded.
INSERT INTO "consultants" ("org_id", "deal_id", "role", "side", "firm_name", "contact_name")
SELECT
  d."org_id",
  d."id",
  'psa_attorney'::"public"."consultant_role",
  (CASE WHEN d."psa_drafting" = 'buyer' THEN 'buyer' ELSE 'seller' END)::"public"."consultant_side",
  COALESCE(NULLIF(TRIM(d."psa_attorney_firm"), ''), NULLIF(TRIM(d."psa_attorney_name"), '')),
  NULLIF(TRIM(d."psa_attorney_name"), '')
FROM "deals" d
WHERE (
    NULLIF(TRIM(d."psa_attorney_firm"), '') IS NOT NULL
    OR NULLIF(TRIM(d."psa_attorney_name"), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "consultants" c
    WHERE c."deal_id" = d."id" AND c."role" = 'psa_attorney'
  );
