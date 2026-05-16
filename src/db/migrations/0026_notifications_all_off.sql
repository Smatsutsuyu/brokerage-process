ALTER TABLE "users" ALTER COLUMN "notify_on_reply_to_mine" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notify_on_status_change_to_mine" SET DEFAULT false;--> statement-breakpoint
UPDATE "users" SET
  "notify_on_new_feedback" = false,
  "notify_on_new_comment" = false,
  "notify_on_reply_to_mine" = false,
  "notify_on_status_change_to_mine" = false;
