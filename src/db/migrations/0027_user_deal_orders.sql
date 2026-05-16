CREATE TABLE "user_deal_orders" (
  "user_id" uuid NOT NULL,
  "deal_id" uuid NOT NULL,
  "sort_order" integer NOT NULL,
  CONSTRAINT "user_deal_orders_user_id_deal_id_pk" PRIMARY KEY("user_id","deal_id")
);
--> statement-breakpoint
ALTER TABLE "user_deal_orders" ADD CONSTRAINT "user_deal_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_deal_orders" ADD CONSTRAINT "user_deal_orders_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
