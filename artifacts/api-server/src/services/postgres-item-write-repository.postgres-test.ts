import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { PostgresItemWriteRepository } from "./postgres-item-write-repository";
import { ItemWriteService } from "./item-write-service";
import type { ItemDraft } from "@workspace/domain";

const migrationsFolder = fileURLToPath(new URL("../../../../lib/db/drizzle", import.meta.url));

before(async () => {
  assert.match(process.env.DATABASE_URL ?? "", /vtk_phase1_test/, "PostgreSQL tests require the disposable vtk_phase1_test database");
  await pool.query("drop schema public cascade; create schema public");
  await migrate(db, { migrationsFolder });
});
after(async () => pool.end());

async function seedItem(sourceRowId: string) {
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ($1, 'test') returning id", [`Synthetic ${sourceRowId}`]);
  const item = await pool.query<{ id: string }>("insert into listing_items(batch_id, source_row_id, sku, original_values, normalized_values, question_configuration, status) values ($1, $2, $3, '{}', '{\"manufacturer\":\"VTK\",\"model\":\"Synthetic\",\"title\":\"Synthetic item\"}', '{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}', 'ready_for_employee') returning id", [batch.rows[0].id, sourceRowId, `SYN-${sourceRowId}`]);
  return item.rows[0].id;
}

function draft(itemId: string, employeeId: string, notes = ""): ItemDraft {
  return { itemId: itemId as ItemDraft["itemId"], itemVersion: 1, includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: null, fieldValues: {}, notes, employeeId: employeeId as ItemDraft["employeeId"], status: "editing", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" };
}

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

test("concurrent identical writes produce one answer and one audit then replay", async () => {
  const itemId = await seedItem("concurrent-identical"); const service = new ItemWriteService(new PostgresItemWriteRepository()); const input = { idempotencyKey: "concurrent-identical", actorId: "employee-concurrent", correlationId: "00000000-0000-4000-8000-000000000010", draft: draft(itemId, "employee-concurrent") };
  const results = await Promise.all([service.save(input), service.save(input)]);
  assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
  assert.equal((await pool.query("select 1 from item_drafts where item_id=$1", [itemId])).rowCount, 1);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1", [itemId])).rowCount, 1);
});

test("different keys and a stale tab cannot advance the same item twice", async () => {
  const itemId = await seedItem("competing-keys"); const service = new ItemWriteService(new PostgresItemWriteRepository()); const original = draft(itemId, "employee-lock");
  const outcomes = await Promise.allSettled([service.save({ idempotencyKey: "key-a", actorId: "employee-lock", correlationId: "00000000-0000-4000-8000-000000000011", draft: original }), service.save({ idempotencyKey: "key-b", actorId: "employee-lock", correlationId: "00000000-0000-4000-8000-000000000012", draft: original })]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1); assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1", [itemId])).rowCount, 1);
});

test("same key is valid across actors but conflicts across items for one actor", async () => {
  const service = new ItemWriteService(new PostgresItemWriteRepository()); const actorA = await seedItem("actor-a"); const actorB = await seedItem("actor-b");
  await Promise.all([service.save({ idempotencyKey: "shared-actor-key", actorId: "actor-a", correlationId: "00000000-0000-4000-8000-000000000013", draft: draft(actorA, "actor-a") }), service.save({ idempotencyKey: "shared-actor-key", actorId: "actor-b", correlationId: "00000000-0000-4000-8000-000000000014", draft: draft(actorB, "actor-b") })]);
  const first = await seedItem("same-actor-one"); const second = await seedItem("same-actor-two");
  await service.save({ idempotencyKey: "same-actor-cross-item", actorId: "one-actor", correlationId: "00000000-0000-4000-8000-000000000015", draft: draft(first, "one-actor") });
  await assert.rejects(() => service.save({ idempotencyKey: "same-actor-cross-item", actorId: "one-actor", correlationId: "00000000-0000-4000-8000-000000000016", draft: draft(second, "one-actor") }), /different request/);
});

test("expired keys are reusable and mutation followed by failure rolls back", async () => {
  const repository = new PostgresItemWriteRepository(); const response = { itemId: "00000000-0000-4000-8000-000000000020", itemVersion: 2, status: "completed" as const, nextItemId: null, replayed: false };
  await repository.executeIdempotent("expiring-key", "expiry-actor", "old", async () => response);
  await pool.query("update idempotency_records set created_at=now()-interval '2 days', expires_at=now()-interval '1 second' where actor_id='expiry-actor' and key='expiring-key'");
  await repository.executeIdempotent("expiring-key", "expiry-actor", "new", async () => response);
  const itemId = await seedItem("forced-rollback");
  await assert.rejects(() => repository.executeIdempotent("forced-rollback", "rollback-actor", "hash", async (tx) => { const locked = await tx.getItemForUpdate(itemId); assert.ok(locked); await tx.saveAnswer(draft(itemId, "rollback-actor"), "completed"); throw new Error("forced after mutation"); }), /forced after mutation/);
  const state = await pool.query<{ status: string; version: number }>("select status, version from listing_items where id=$1", [itemId]);
  assert.deepEqual(state.rows[0], { status: "ready_for_employee", version: 1 }); assert.equal((await pool.query("select 1 from item_drafts where item_id=$1", [itemId])).rowCount, 0);
});
