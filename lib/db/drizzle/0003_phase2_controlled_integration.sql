ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'batch_import_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'batch_import_failed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'item_draft_saved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'batch_completed';--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "created_by" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "source_checksum" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "schema_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_creator_import_key_uq" ON "batches" USING btree ("created_by","import_key");--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "imported_files_storage_key_uq" ON "imported_files" USING btree ("storage_key");
