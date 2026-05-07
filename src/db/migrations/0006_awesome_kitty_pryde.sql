CREATE TYPE "public"."psa_drafting" AS ENUM('buyer', 'seller', 'na');--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "psa_attorney_name" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "psa_attorney_firm" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "psa_drafting" "psa_drafting";