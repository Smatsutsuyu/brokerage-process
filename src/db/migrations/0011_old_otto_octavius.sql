CREATE TABLE "deal_contacts" (
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_contacts_deal_id_contact_id_pk" PRIMARY KEY("deal_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: preserve current "deal contacts" visibility under the new
-- explicit-assignment model. Before this migration, a contact appeared on
-- a deal because their builder had a deal_buyers row for that deal. After
-- this migration, presence is per-row in deal_contacts. Insert one row per
-- (deal, contact) for every existing implicit relationship so users see
-- the same set of contacts on each deal as they did pre-migration.
-- Idempotent via ON CONFLICT — re-running the migration is safe.
-- org_id pulled from contacts (matches the contact's owning org, which is
-- the same as the deal's org since cross-tenant isn't possible).
INSERT INTO "deal_contacts" ("org_id", "deal_id", "contact_id", "added_at")
SELECT DISTINCT
  c."org_id",
  db."deal_id",
  c."id",
  COALESCE(db."created_at", now())
FROM "deal_buyers" db
JOIN "contacts" c ON c."builder_id" = db."builder_id"
ON CONFLICT ("deal_id", "contact_id") DO NOTHING;