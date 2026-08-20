CREATE TYPE "public"."audit_action" AS ENUM('employee_answer_saved', 'needs_review_selected', 'review_resolved', 'processing_started', 'processing_completed', 'processing_failed', 'listing_exported');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_role" AS ENUM('employee', 'reviewer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."batch_source" AS ENUM('csv', 'manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_reason_code" AS ENUM('inventory_discrepancy', 'item_damage', 'identity_uncertain', 'missing_information', 'workflow_exception', 'other');--> statement-breakpoint
ALTER TABLE "review_records" DROP CONSTRAINT "review_records_versions_positive";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_role" SET DATA TYPE "public"."audit_actor_role" USING "actor_role"::"public"."audit_actor_role";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "action" SET DATA TYPE "public"."audit_action" USING "action"::"public"."audit_action";--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "source" SET DATA TYPE "public"."batch_source" USING "source"::"public"."batch_source";--> statement-breakpoint
ALTER TABLE "processing_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."processing_job_status" USING "status"::"public"."processing_job_status";--> statement-breakpoint
ALTER TABLE "review_records" ALTER COLUMN "reason_code" SET DATA TYPE "public"."review_reason_code" USING "reason_code"::"public"."review_reason_code";--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_type_nonempty" CHECK (length(trim("processing_jobs"."job_type")) > 0);--> statement-breakpoint
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_versions_ordered" CHECK ("review_records"."source_item_version" > 0 and "review_records"."resulting_item_version" > "review_records"."source_item_version");