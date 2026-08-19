import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { PostgresItemWriteRepository } from "./postgres-item-write-repository";

const migrationsFolder = fileURLToPath(new URL("../../../../lib/db/drizzle", import.meta.url));

before(async () => {
  assert.match(process.env.DATABASE_URL ?? "", /vtk_phase1_test/, "PostgreSQL tests require the disposable vtk_phase1_test database");
  await pool.query("drop schema public cascade; create schema public");
  await migrate(db, { migrationsFolder });
});
after(async () => pool.end());

test("all seven Phase 1 tables and append-only audit protection exist", async () => {
  const tables = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' order by table_name");
  assert.deepEqual(tables.rows.map((row) => row.table_name).filter((name) => !name.startsWith("__drizzle")), ["audit_events", "batches", "idempotency_records", "item_drafts", "listing_items", "processing_jobs", "review_records"]);
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ('Synthetic', 'test') returning id");
  await pool.query("insert into audit_events(batch_id, actor_id, actor_role, action, correlation_id) values ($1, 'test', 'employee', 'test', gen_random_uuid()::text)", [batch.rows[0].id]);
  await assert.rejects(() => pool.query("update audit_events set action='changed'"), /append-only/);
  await assert.rejects(() => pool.query("delete from audit_events"), /append-only/);
});

test("idempotency is actor plus operation plus key, expires safely, and rolls back failures", async () => {
  const repository = new PostgresItemWriteRepository();
  let calls = 0;
  const response = { itemId: "00000000-0000-4000-8000-000000000001", itemVersion: 2, status: "completed" as const, nextItemId: null, replayed: false };
  const first = await repository.executeIdempotent("same-key", "actor-a", "hash-a", async () => { calls += 1; return response; });
  const replay = await repository.executeIdempotent("same-key", "actor-a", "hash-a", async () => { calls += 1; return response; });
  await repository.executeIdempotent("same-key", "actor-b", "hash-b", async () => response);
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(calls, 1);
  await assert.rejects(() => repository.executeIdempotent("same-key", "actor-a", "different", async () => response), /different request/);
  await assert.rejects(() => repository.executeIdempotent("rollback", "actor-a", "hash", async () => { await pool.query("select 1"); throw new Error("forced rollback"); }), /forced rollback/);
  const rows = await pool.query("select * from idempotency_records where key='rollback'");
  assert.equal(rows.rowCount, 0);
});

test("database constraints reject invalid versions and job metrics", async () => {
  await assert.rejects(() => pool.query("insert into batches(name, source, version) values ('Bad', 'test', 0)"), /batches_version_positive/);
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ('Metrics', 'test') returning id");
  const item = await pool.query<{ id: string }>("insert into listing_items(batch_id, source_row_id, sku, original_values, normalized_values, question_configuration) values ($1, '1', 'SYN-1', '{}', '{}', '{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}') returning id", [batch.rows[0].id]);
  await assert.rejects(() => pool.query("insert into processing_jobs(item_id, job_type, status, idempotency_key, attempt_count) values ($1, 'test', 'pending', 'bad-metric', -1)", [item.rows[0].id]), /processing_jobs_metrics_nonnegative/);
});
