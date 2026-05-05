ALTER TABLE "contacts" DROP CONSTRAINT "contacts_builder_id_builders_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "builder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE set null ON UPDATE no action;