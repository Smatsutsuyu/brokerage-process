CREATE TABLE "feedback_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing feedback_items.response becomes the first comment
-- on its item. Authored by the org owner (assumes one owner per org, which
-- is true at Lakebridge launch). Stamped with the item's reviewedAt or
-- createdAt so the timeline reads sensibly. Idempotent: only runs for items
-- with a non-empty response and no existing comments.
INSERT INTO "feedback_comments" ("feedback_id", "user_id", "user_email", "body", "created_at", "updated_at")
SELECT
  fi."id",
  u."id",
  u."email",
  fi."response",
  COALESCE(fi."reviewed_at", fi."created_at"),
  COALESCE(fi."reviewed_at", fi."created_at")
FROM "feedback_items" fi
JOIN "users" u ON u."org_id" = fi."org_id" AND u."role" = 'owner'
WHERE fi."response" IS NOT NULL
  AND length(trim(fi."response")) > 0
  AND NOT EXISTS (SELECT 1 FROM "feedback_comments" fc WHERE fc."feedback_id" = fi."id");