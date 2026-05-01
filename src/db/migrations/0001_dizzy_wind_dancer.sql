CREATE TYPE "public"."feedback_severity" AS ENUM('nit', 'suggestion', 'bug', 'blocker');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'reviewed', 'actioned', 'wontfix');--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"section" text NOT NULL,
	"page_path" text NOT NULL,
	"commit_sha" text,
	"severity" "feedback_severity" DEFAULT 'suggestion' NOT NULL,
	"comment" text NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"actioned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;