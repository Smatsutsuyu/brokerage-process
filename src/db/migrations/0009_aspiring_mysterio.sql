ALTER TABLE "users" ADD COLUMN "is_developer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_on_new_feedback" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_on_new_comment" boolean DEFAULT true NOT NULL;