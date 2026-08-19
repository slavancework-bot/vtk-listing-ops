import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const workflowStatus = pgEnum("workflow_status", ["pending", "ready_for_employee", "in_progress", "completed", "needs_review", "awaiting_processing", "processing_failed", "reviewed", "exported"]);

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), source: text("source").notNull(),
  sourceFileMetadata: jsonb("source_file_metadata").$type<Record<string, unknown>>(), status: workflowStatus("status").notNull().default("pending"),
  version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("batches_version_positive", sql`${table.version} > 0`)]);

export const listingItems = pgTable("listing_items", {
  id: uuid("id").primaryKey().defaultRandom(), batchId: uuid("batch_id").notNull().references(() => batches.id), sourceRowId: text("source_row_id").notNull(), sourceRowNumber: integer("source_row_number"),
  sku: text("sku").notNull(), inventoryId: text("inventory_id"), itemId: text("source_item_id"), originalValues: jsonb("original_values").$type<Record<string, unknown>>().notNull(),
  normalizedValues: jsonb("normalized_values").$type<Record<string, unknown>>().notNull(), questionConfiguration: jsonb("question_configuration").$type<Record<string, unknown>>().notNull(),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]), status: workflowStatus("status").notNull().default("pending"), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("listing_items_batch_source_row_uq").on(table.batchId, table.sourceRowId), index("listing_items_batch_status_idx").on(table.batchId, table.status), check("listing_items_version_positive", sql`${table.version} > 0`), check("listing_items_source_row_positive", sql`${table.sourceRowNumber} is null or ${table.sourceRowNumber} > 0`)]);

export const itemDrafts = pgTable("item_drafts", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").notNull().references(() => listingItems.id), employeeId: text("employee_id").notNull(), itemVersion: integer("item_version").notNull(),
  draftStatus: text("draft_status").notNull(), answer: jsonb("answer").$type<Record<string, unknown>>().notNull(), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("item_drafts_item_employee_uq").on(table.itemId, table.employeeId), check("item_drafts_versions_positive", sql`${table.itemVersion} > 0 and ${table.version} > 0`), check("item_drafts_status_valid", sql`${table.draftStatus} in ('new','editing','restored','submitted','needs_review')`)]);

export const reviewRecords = pgTable("review_records", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").notNull().references(() => listingItems.id), employeeId: text("employee_id").notNull(), sourceItemVersion: integer("source_item_version").notNull(), resultingItemVersion: integer("resulting_item_version").notNull(),
  reasonCode: text("reason_code").notNull(), note: text("note"), enteredAnswer: jsonb("entered_answer").$type<Record<string, unknown>>().notNull(), sourceState: jsonb("source_state").$type<Record<string, unknown>>().notNull(),
  resolved: boolean("resolved").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("review_records_versions_positive", sql`${table.sourceItemVersion} > 0 and ${table.resultingItemVersion} > 0`)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").references(() => listingItems.id), batchId: uuid("batch_id").references(() => batches.id), actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(), action: text("action").notNull(), previousStatus: workflowStatus("previous_status"), newStatus: workflowStatus("new_status"), correlationId: text("correlation_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_events_item_created_idx").on(table.itemId, table.createdAt)]);

export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").primaryKey().defaultRandom(), itemId: uuid("item_id").notNull().references(() => listingItems.id), jobType: text("job_type").notNull(), status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(), attemptCount: integer("attempt_count").notNull().default(0), promptId: text("prompt_id"), promptVersion: text("prompt_version"), model: text("model"),
  inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }), latencyMs: integer("latency_ms"), errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("processing_jobs_idempotency_uq").on(table.idempotencyKey), check("processing_jobs_metrics_nonnegative", sql`${table.attemptCount} >= 0 and (${table.inputTokens} is null or ${table.inputTokens} >= 0) and (${table.outputTokens} is null or ${table.outputTokens} >= 0) and (${table.estimatedCostMicros} is null or ${table.estimatedCostMicros} >= 0) and (${table.latencyMs} is null or ${table.latencyMs} >= 0)`)]);

export const idempotencyRecords = pgTable("idempotency_records", {
  id: uuid("id").primaryKey().defaultRandom(), key: text("key").notNull(), actorId: text("actor_id").notNull(), operation: text("operation").notNull(), requestHash: text("request_hash").notNull(), responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("idempotency_actor_operation_key_uq").on(table.actorId, table.operation, table.key), check("idempotency_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`), check("idempotency_response_status_valid", sql`${table.responseStatus} between 100 and 599`)]);

export type BatchRow = typeof batches.$inferSelect;
export type ListingItemRow = typeof listingItems.$inferSelect;
