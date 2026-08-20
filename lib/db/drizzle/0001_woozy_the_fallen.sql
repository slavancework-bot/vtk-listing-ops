ALTER TABLE "review_records" RENAME COLUMN "item_version" TO "source_item_version";--> statement-breakpoint
ALTER TABLE "idempotency_records" DROP CONSTRAINT "idempotency_records_pkey";--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_records" ADD COLUMN "resulting_item_version" integer;--> statement-breakpoint
UPDATE "review_records" SET "resulting_item_version" = "source_item_version" + 1;--> statement-breakpoint
ALTER TABLE "review_records" ALTER COLUMN "resulting_item_version" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_operation_key_uq" ON "idempotency_records" USING btree ("actor_id","operation","key");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_version_positive" CHECK ("batches"."version" > 0);--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_expiry_after_creation" CHECK ("idempotency_records"."expires_at" > "idempotency_records"."created_at");--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_response_status_valid" CHECK ("idempotency_records"."response_status" between 100 and 599);--> statement-breakpoint
ALTER TABLE "item_drafts" ADD CONSTRAINT "item_drafts_versions_positive" CHECK ("item_drafts"."item_version" > 0 and "item_drafts"."version" > 0);--> statement-breakpoint
ALTER TABLE "item_drafts" ADD CONSTRAINT "item_drafts_status_valid" CHECK ("item_drafts"."draft_status" in ('new','editing','restored','submitted','needs_review'));--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_version_positive" CHECK ("listing_items"."version" > 0);--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_source_row_positive" CHECK ("listing_items"."source_row_number" is null or "listing_items"."source_row_number" > 0);--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_metrics_nonnegative" CHECK ("processing_jobs"."attempt_count" >= 0 and ("processing_jobs"."input_tokens" is null or "processing_jobs"."input_tokens" >= 0) and ("processing_jobs"."output_tokens" is null or "processing_jobs"."output_tokens" >= 0) and ("processing_jobs"."estimated_cost_micros" is null or "processing_jobs"."estimated_cost_micros" >= 0) and ("processing_jobs"."latency_ms" is null or "processing_jobs"."latency_ms" >= 0));--> statement-breakpoint
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_versions_positive" CHECK ("review_records"."source_item_version" > 0 and "review_records"."resulting_item_version" > 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
