CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'ready_for_employee', 'in_progress', 'completed', 'needs_review', 'awaiting_processing', 'processing_failed', 'reviewed', 'exported');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid,
	"batch_id" uuid,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"previous_status" "workflow_status",
	"new_status" "workflow_status",
	"correlation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"source_file_metadata" jsonb,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"key" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"item_version" integer NOT NULL,
	"draft_status" text NOT NULL,
	"answer" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_row_id" text NOT NULL,
	"source_row_number" integer,
	"sku" text NOT NULL,
	"inventory_id" text,
	"source_item_id" text,
	"original_values" jsonb NOT NULL,
	"normalized_values" jsonb NOT NULL,
	"question_configuration" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"prompt_id" text,
	"prompt_version" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_micros" bigint,
	"latency_ms" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"item_version" integer NOT NULL,
	"reason_code" text NOT NULL,
	"note" text,
	"entered_answer" jsonb NOT NULL,
	"source_state" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_drafts" ADD CONSTRAINT "item_drafts_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_item_created_idx" ON "audit_events" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "item_drafts_item_employee_uq" ON "item_drafts" USING btree ("item_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_items_batch_source_row_uq" ON "listing_items" USING btree ("batch_id","source_row_id");--> statement-breakpoint
CREATE INDEX "listing_items_batch_status_idx" ON "listing_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_jobs_idempotency_uq" ON "processing_jobs" USING btree ("idempotency_key");