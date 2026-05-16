ALTER TABLE "users" DROP COLUMN "is_developer";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notify_on_new_feedback" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notify_on_new_comment" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_on_reply_to_mine" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_on_status_change_to_mine" boolean DEFAULT true NOT NULL;
