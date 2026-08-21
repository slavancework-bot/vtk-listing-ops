ALTER TYPE "public"."audit_action" ADD VALUE 'batch_import_created' BEFORE 'employee_answer_saved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'batch_import_failed' BEFORE 'employee_answer_saved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'item_draft_saved' BEFORE 'employee_answer_saved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'batch_completed' BEFORE 'review_resolved';--> statement-breakpoint
CREATE TABLE "imported_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"uploader_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"safe_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_files_size_positive" CHECK ("imported_files"."size_bytes" > 0),
	CONSTRAINT "imported_files_status_valid" CHECK ("imported_files"."status" in ('stored','imported','failed'))
);
--> statement-breakpoint
CREATE TABLE "listing_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"rule_version" text NOT NULL,
	"normalized_values" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"repairs" jsonb NOT NULL,
	"employee_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewer_decision" jsonb,
	"export_ready" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_analyses_version_positive" CHECK ("listing_analyses"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "listing_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"rule_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"checksum" text NOT NULL,
	"row_count" integer NOT NULL,
	"content" text NOT NULL,
	"field_diffs" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_exports_row_count_nonnegative" CHECK ("listing_exports"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "listing_questions" (
	"id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"answer" jsonb,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "created_by" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "source_checksum" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "schema_version" text;--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_analyses" ADD CONSTRAINT "listing_analyses_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_exports" ADD CONSTRAINT "listing_exports_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_questions" ADD CONSTRAINT "listing_questions_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "imported_files_storage_key_uq" ON "imported_files" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_analyses_item_rule_uq" ON "listing_analyses" USING btree ("item_id","rule_version");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_exports_batch_checksum_uq" ON "listing_exports" USING btree ("batch_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_questions_item_id_uq" ON "listing_questions" USING btree ("item_id","id");--> statement-breakpoint
CREATE INDEX "listing_questions_item_idx" ON "listing_questions" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_creator_import_key_uq" ON "batches" USING btree ("created_by","import_key");