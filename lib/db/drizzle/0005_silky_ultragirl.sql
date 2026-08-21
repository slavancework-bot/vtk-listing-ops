DROP INDEX "listing_exports_batch_checksum_uq";--> statement-breakpoint
DROP INDEX "listing_questions_item_id_uq";--> statement-breakpoint
DROP INDEX "listing_questions_item_idx";--> statement-breakpoint
ALTER TABLE "listing_questions" ADD COLUMN "analysis_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_questions" ADD COLUMN "rule_version" text;--> statement-breakpoint
ALTER TABLE "listing_questions" ADD COLUMN "display_order" integer;--> statement-breakpoint
ALTER TABLE "listing_questions" ADD COLUMN "lifecycle_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "listing_questions" q SET "analysis_id"=a."id", "rule_version"=a."rule_version", "display_order"=COALESCE((q."configuration"->>'displayOrder')::integer, 0) FROM "listing_analyses" a WHERE a."item_id"=q."item_id";--> statement-breakpoint
ALTER TABLE "listing_questions" ALTER COLUMN "analysis_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_questions" ALTER COLUMN "rule_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_questions" ALTER COLUMN "display_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_questions" ADD CONSTRAINT "listing_questions_analysis_id_listing_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."listing_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_exports_batch_rule_schema_uq" ON "listing_exports" USING btree ("batch_id","rule_version","schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_questions_analysis_id_uq" ON "listing_questions" USING btree ("analysis_id","id");--> statement-breakpoint
CREATE INDEX "listing_questions_item_rule_status_idx" ON "listing_questions" USING btree ("item_id","rule_version","lifecycle_status");--> statement-breakpoint
ALTER TABLE "listing_questions" ADD CONSTRAINT "listing_questions_lifecycle_valid" CHECK ("listing_questions"."lifecycle_status" in ('active','answered','superseded'));
