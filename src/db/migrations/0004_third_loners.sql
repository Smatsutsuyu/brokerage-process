ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'final';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "checklist_item_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE set null ON UPDATE no action;