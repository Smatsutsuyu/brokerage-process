CREATE TABLE "checklist_item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"checklist_item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_item_links" ADD CONSTRAINT "checklist_item_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_links" ADD CONSTRAINT "checklist_item_links_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing single-link (external_link_url) becomes a row
-- in checklist_item_links so users see the same set of links after the
-- old columns are dropped. org_id pulled from the parent item; sortOrder
-- defaults to 0 (only one link per item under the old model). Idempotent
-- via the WHERE — if the migration is re-run, nothing duplicates because
-- the old columns will already be gone.
INSERT INTO "checklist_item_links" ("org_id", "checklist_item_id", "url", "label")
SELECT "org_id", "id", "external_link_url", "external_link_label"
FROM "checklist_items"
WHERE "external_link_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_items" DROP COLUMN "external_link_url";--> statement-breakpoint
ALTER TABLE "checklist_items" DROP COLUMN "external_link_label";