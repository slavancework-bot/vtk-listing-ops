import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { PostgresItemWriteRepository } from "./postgres-item-write-repository";
import { ItemWriteService } from "./item-write-service";
import type { ItemDraft } from "@workspace/domain";
import { ApiFault } from "../lib/errors";
import { readFile } from "node:fs/promises";
import { Phase2Service } from "./phase2-service";
import type { FileStorage } from "./file-storage";
import { createApp } from "../app";
import type { IdentityProvider } from "../middleware/identity";
import type { Request } from "express";

const migrationsFolder = fileURLToPath(new URL("../../../../lib/db/drizzle", import.meta.url));

before(async () => {
  assert.match(process.env.DATABASE_URL ?? "", /vtk_phase1_test/, "PostgreSQL tests require the disposable vtk_phase1_test database");
  await pool.query("drop schema public cascade; create schema public");
  await migrate(db, { migrationsFolder });
});
after(async () => pool.end());

async function seedItem(sourceRowId: string) {
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ($1, 'csv') returning id", [`Synthetic ${sourceRowId}`]);
  const item = await pool.query<{ id: string }>("insert into listing_items(batch_id, source_row_id, sku, original_values, normalized_values, question_configuration, status) values ($1, $2, $3, '{}', '{\"manufacturer\":\"VTK\",\"model\":\"Synthetic\",\"title\":\"Synthetic item\"}', '{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}', 'ready_for_employee') returning id", [batch.rows[0].id, sourceRowId, `SYN-${sourceRowId}`]);
  return item.rows[0].id;
}

function draft(itemId: string, employeeId: string, notes = ""): ItemDraft {
  return { itemId: itemId as ItemDraft["itemId"], itemVersion: 1, includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: null, fieldValues: {}, notes, employeeId: employeeId as ItemDraft["employeeId"], status: "editing", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" };
}

class PgHeaderIdentity implements IdentityProvider {async authenticate(req:Request){const subject=req.header("x-test-user");const role=req.header("x-test-role");return subject&&["employee","reviewer","admin"].includes(role??"")?{subject,role:role as "employee"|"reviewer"|"admin"}:null;}}

test("all seven Phase 1 tables and append-only audit protection exist", async () => {
  const tables = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' order by table_name");
  assert.deepEqual(tables.rows.map((row) => row.table_name).filter((name) => !name.startsWith("__drizzle")), ["audit_events", "batches", "idempotency_records", "imported_files", "item_drafts", "listing_items", "processing_jobs", "review_records"]);
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ('Synthetic', 'csv') returning id");
  await pool.query("insert into audit_events(batch_id, actor_id, actor_role, action, correlation_id) values ($1, 'test', 'employee', 'employee_answer_saved', gen_random_uuid()::text)", [batch.rows[0].id]);
  await assert.rejects(() => pool.query("update audit_events set action='employee_answer_saved'"), /append-only/);
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

test("database constraints reject invalid versions, controlled domains, and job metrics", async () => {
  await assert.rejects(() => pool.query("insert into batches(name, source, version) values ('Bad', 'csv', 0)"), /batches_version_positive/);
  await assert.rejects(() => pool.query("insert into batches(name, source) values ('Bad source', 'live_sixbit')"), /batch_source/);
  const batch = await pool.query<{ id: string }>("insert into batches(name, source) values ('Metrics', 'csv') returning id");
  const item = await pool.query<{ id: string }>("insert into listing_items(batch_id, source_row_id, sku, original_values, normalized_values, question_configuration) values ($1, '1', 'SYN-1', '{}', '{}', '{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}') returning id", [batch.rows[0].id]);
  await assert.rejects(() => pool.query("insert into processing_jobs(item_id, job_type, status, idempotency_key, attempt_count) values ($1, 'test', 'pending', 'bad-metric', -1)", [item.rows[0].id]), /processing_jobs_metrics_nonnegative/);
  await assert.rejects(() => pool.query("insert into processing_jobs(item_id, job_type, status, idempotency_key) values ($1, '', 'pending', 'blank-job')", [item.rows[0].id]), /processing_jobs_type_nonempty/);
  await assert.rejects(() => pool.query("insert into processing_jobs(item_id, job_type, status, idempotency_key) values ($1, 'normalize', 'unknown', 'bad-status')", [item.rows[0].id]), /processing_job_status/);
  await assert.rejects(() => pool.query("insert into review_records(item_id, employee_id, source_item_version, resulting_item_version, reason_code, entered_answer, source_state) values ($1, 'employee', 1, 2, 'uncontrolled', '{}', '{}')", [item.rows[0].id]), /review_reason_code/);
  await assert.rejects(() => pool.query("insert into review_records(item_id, employee_id, source_item_version, resulting_item_version, reason_code, entered_answer, source_state) values ($1, 'employee', 2, 2, 'other', '{}', '{}')", [item.rows[0].id]), /review_records_versions_ordered/);
  await assert.rejects(() => pool.query("insert into audit_events(item_id, actor_id, actor_role, action, correlation_id) values ($1, 'actor', 'outsider', 'employee_answer_saved', gen_random_uuid()::text)", [item.rows[0].id]), /audit_actor_role/);
  await assert.rejects(() => pool.query("insert into audit_events(item_id, actor_id, actor_role, action, correlation_id) values ($1, 'actor', 'employee', 'uncontrolled_action', gen_random_uuid()::text)", [item.rows[0].id]), /audit_action/);
  await assert.rejects(() => pool.query("insert into idempotency_records(key, actor_id, operation, request_hash, response_status, response_body, created_at, expires_at) values ('bad-expiry-equal', 'actor', 'employee_item_write', 'hash', 200, '{}', now(), now())"), /idempotency_expiry_after_creation/);
  await assert.rejects(() => pool.query("insert into idempotency_records(key, actor_id, operation, request_hash, response_status, response_body, created_at, expires_at) values ('bad-expiry-earlier', 'actor', 'employee_item_write', 'hash', 200, '{}', now(), now()-interval '1 second')"), /idempotency_expiry_after_creation/);
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
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const loser = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  assert.ok(loser); assert.ok(loser.reason instanceof ApiFault); assert.equal(loser.reason.status, 409); assert.equal(loser.reason.code, "CONFLICT"); assert.equal(loser.reason.details?.currentVersion, 2);
  const final = await pool.query<{ status: string; version: number }>("select status, version from listing_items where id=$1", [itemId]);
  assert.deepEqual(final.rows[0], { status: "completed", version: 2 });
  assert.equal((await pool.query("select 1 from item_drafts where item_id=$1", [itemId])).rowCount, 1);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1", [itemId])).rowCount, 1);
  assert.equal((await pool.query("select 1 from review_records where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from idempotency_records where actor_id='employee-lock' and key in ('key-a','key-b')")).rowCount, 1);
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
  assert.equal((await pool.query("select 1 from idempotency_records where actor_id='expiry-actor' and key='expiring-key'")).rowCount, 1);
  const itemId = await seedItem("forced-rollback");
  await assert.rejects(() => repository.executeIdempotent("forced-rollback", "rollback-actor", "hash", async (tx) => {
    const rollbackDraft = draft(itemId, "rollback-actor", "must roll back"); const locked = await tx.getItemForUpdate(itemId); assert.ok(locked);
    await tx.saveAnswer(rollbackDraft, "needs_review"); assert.ok(tx.saveReview); await tx.saveReview(rollbackDraft, { code: "other", note: "rollback review" });
    await tx.appendAudit({ itemId, actorId: "rollback-actor", action: "needs_review_selected", previousStatus: "ready_for_employee", newStatus: "needs_review", correlationId: "00000000-0000-4000-8000-000000000030" });
    throw new Error("forced after all workflow mutations");
  }), /forced after all workflow mutations/);
  const state = await pool.query<{ status: string; version: number }>("select status, version from listing_items where id=$1", [itemId]);
  assert.deepEqual(state.rows[0], { status: "ready_for_employee", version: 1 });
  assert.equal((await pool.query("select 1 from item_drafts where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from review_records where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from idempotency_records where actor_id='rollback-actor' and key='forced-rollback'")).rowCount, 0);
});

test("retry after committed response loss replays exactly without duplicate effects", async () => {
  const itemId = await seedItem("response-loss"); const service = new ItemWriteService(new PostgresItemWriteRepository());
  const input = { idempotencyKey: "response-loss", actorId: "response-loss-actor", correlationId: "00000000-0000-4000-8000-000000000040", draft: draft(itemId, "response-loss-actor", "persist this note") };
  const authoritativeResponse = await service.save(input); // Commit succeeded; treat this returned response as lost by the client.
  const retriedResponse = await service.save(input);
  assert.deepEqual(retriedResponse, { ...authoritativeResponse, replayed: true });
  const item = await pool.query<{ status: string; version: number }>("select status, version from listing_items where id=$1", [itemId]); assert.deepEqual(item.rows[0], { status: "completed", version: 2 });
  const drafts = await pool.query<{ notes: string }>("select answer->>'notes' as notes from item_drafts where item_id=$1", [itemId]); assert.equal(drafts.rowCount, 1); assert.equal(drafts.rows[0].notes, "persist this note");
  assert.equal((await pool.query("select 1 from review_records where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1", [itemId])).rowCount, 1);
  assert.equal((await pool.query("select 1 from processing_jobs where item_id=$1", [itemId])).rowCount, 0);
  assert.equal((await pool.query("select 1 from idempotency_records where actor_id='response-loss-actor' and key='response-loss'")).rowCount, 1);
});

test("controlled import, draft restore, final persistence, and authoritative progress cross PostgreSQL", async () => {
  const stored = new Map<string,Buffer>(); let sequence=0;
  const storage:FileStorage={store:async(content)=>{const key=`test-${++sequence}.csv`;stored.set(key,content);return{key,remove:async()=>{stored.delete(key);}};}};
  const phase2=new Phase2Service(storage);
  const content=await readFile(new URL("../../../../fixtures/phase2-controlled-eight-scenarios-v1.csv",import.meta.url),"utf8");
  const input={actorId:"development-employee",role:"employee",importKey:"phase2-e2e-import",filename:"../controlled.csv",mimeType:"text/csv",content,correlationId:"00000000-0000-4000-8000-000000000050"};
  const imported=await phase2.importBatch(input); assert.equal(imported.itemCount,8);assert.equal(imported.replayed,false);assert.equal(stored.size,1);
  const replayed=await phase2.importBatch(input);assert.equal(replayed.batchId,imported.batchId);assert.equal(replayed.replayed,true);assert.equal(stored.size,1);
  await assert.rejects(()=>phase2.importBatch({...input,content:`${content}\n`,importKey:input.importKey}), (error:unknown)=>error instanceof ApiFault&&error.status===409);
  const duplicateRows=content.replace(",B,VTK-C1111-4P-14",",A,VTK-C1111-4P-14");await assert.rejects(()=>phase2.importBatch({...input,content:duplicateRows,importKey:"forced-partial-failure"}));assert.equal(stored.size,1,"failed transaction removes its newly stored file");assert.equal((await pool.query("select 1 from batches where import_key='forced-partial-failure'")).rowCount,0);
  const items=await phase2.listItems(imported.batchId,"development-employee","employee");assert.equal(items.length,8);const first=items[0];
  const firstDraft={...draft(first.id,"development-employee","server-backed draft"),conditionCode:"A" as const};await phase2.saveDraft(first.id,"development-employee","employee",firstDraft as unknown as Record<string,unknown>,0,"00000000-0000-4000-8000-000000000051");
  const restored=await phase2.getItem(first.id,"development-employee","employee");assert.equal((restored.draft as Record<string,unknown>).notes,"server-backed draft");
  const unchanged=await phase2.saveDraft(first.id,"development-employee","employee",firstDraft as unknown as Record<string,unknown>,1,"00000000-0000-4000-8000-000000000058");assert.equal(unchanged.draftVersion,1);assert.equal((await pool.query("select 1 from audit_events where item_id=$1 and action='item_draft_saved'",[first.id])).rowCount,1);
  await assert.rejects(()=>phase2.saveDraft(first.id,"development-employee","employee",{...firstDraft,notes:"stale overwrite"} as unknown as Record<string,unknown>,0,"00000000-0000-4000-8000-000000000059"),(error:unknown)=>error instanceof ApiFault&&error.status===409&&error.details?.currentDraftVersion===1);assert.equal(((await phase2.getItem(first.id,"development-employee","employee")).draft as Record<string,unknown>).notes,"server-backed draft");
  const writes=new ItemWriteService(new PostgresItemWriteRepository());await writes.save({idempotencyKey:"phase2-final",actorId:"development-employee",correlationId:"00000000-0000-4000-8000-000000000052",draft:firstDraft});
  const current=await phase2.getProgress(imported.batchId,"development-employee","employee");assert.deepEqual(current,{totalItemCount:8,completedCount:1,reviewCount:0,processedCount:1,pendingCount:7,percent:13,complete:false});
  await assert.rejects(()=>phase2.saveDraft(first.id,"development-employee","employee",firstDraft as unknown as Record<string,unknown>,1,"00000000-0000-4000-8000-000000000053"),(error:unknown)=>error instanceof ApiFault&&error.status===409);
  await assert.rejects(()=>phase2.getItem(first.id,"other-employee","employee"),(error:unknown)=>error instanceof ApiFault&&error.status===404,"other employees cannot read the item");
  const second=items[1];const competing={...draft(second.id,"development-employee"),conditionCode:"A" as const};const race=await Promise.allSettled([writes.save({idempotencyKey:"phase2-save-race",actorId:"development-employee",correlationId:"00000000-0000-4000-8000-000000000054",draft:competing}),writes.save({idempotencyKey:"phase2-review-race",actorId:"development-employee",correlationId:"00000000-0000-4000-8000-000000000055",draft:competing,reviewReason:{code:"workflow_exception"}})]);assert.equal(race.filter((result)=>result.status==="fulfilled").length,1);assert.ok(race.find((result)=>result.status==="rejected"));assert.equal((await pool.query("select 1 from audit_events where item_id=$1",[second.id])).rowCount,1);assert.ok(["completed","needs_review"].includes((await pool.query<{status:string}>("select status from listing_items where id=$1",[second.id])).rows[0].status));
  assert.equal((await pool.query("select 1 from audit_events where batch_id=$1 and action='batch_import_created'",[imported.batchId])).rowCount,1);
  assert.equal((await pool.query("select 1 from audit_events where item_id=$1 and action='item_draft_saved'",[first.id])).rowCount,1);
  const file=await pool.query<{safe_filename:string;storage_key:string}>("select safe_filename,storage_key from imported_files where batch_id=$1",[imported.batchId]);assert.equal(file.rows[0].safe_filename,"controlled.csv");assert.equal(file.rows[0].storage_key,"test-1.csv");
});

test("concurrent final writes on the last two different items complete the batch exactly once",async()=>{for(let iteration=0;iteration<5;iteration+=1){const actor=`final-two-${iteration}`;const batch=await pool.query<{id:string}>("insert into batches(name,source,created_by,status) values ($1,'csv',$2,'ready_for_employee') returning id",[`Final two ${iteration}`,actor]);const inserted=await pool.query<{id:string}>("insert into listing_items(batch_id,source_row_id,sku,original_values,normalized_values,question_configuration,status) values ($1,'A',$2,'{}','{\"manufacturer\":\"VTK\",\"model\":\"A\",\"title\":\"A\"}','{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}','ready_for_employee'),($1,'B',$3,'{}','{\"manufacturer\":\"VTK\",\"model\":\"B\",\"title\":\"B\"}','{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}','ready_for_employee') returning id",[batch.rows[0].id,`RACE-A-${iteration}`,`RACE-B-${iteration}`]);const service=new ItemWriteService(new PostgresItemWriteRepository());const [a,b]=inserted.rows;const results=await Promise.all([service.save({idempotencyKey:`race-a-${iteration}`,actorId:actor,correlationId:randomCorrelation(iteration,1),draft:draft(a.id,actor)}),service.save({idempotencyKey:`race-b-${iteration}`,actorId:actor,correlationId:randomCorrelation(iteration,2),draft:draft(b.id,actor),reviewReason:iteration%2?{code:"workflow_exception"}:undefined})]);assert.equal(results.length,2);const state=await pool.query<{status:string}>("select status from batches where id=$1",[batch.rows[0].id]);assert.equal(state.rows[0].status,"completed");const items=await pool.query<{status:string;version:number}>("select status,version from listing_items where batch_id=$1 order by source_row_id",[batch.rows[0].id]);assert.deepEqual(items.rows.map((row)=>row.version),[2,2]);assert.equal(items.rows.filter((row)=>["completed","needs_review"].includes(row.status)).length,2);assert.equal((await pool.query("select 1 from audit_events where batch_id=$1 and action='batch_completed'",[batch.rows[0].id])).rowCount,1);const progress=await new Phase2Service({store:async()=>{throw new Error("unused");}}).getProgress(batch.rows[0].id,actor,"employee");assert.equal(progress.pendingCount,0);assert.equal(progress.processedCount,2);const replay=await service.save({idempotencyKey:`race-a-${iteration}`,actorId:actor,correlationId:randomCorrelation(iteration,3),draft:draft(a.id,actor)});assert.equal(replay.replayed,true);assert.equal((await pool.query("select 1 from audit_events where batch_id=$1 and action='batch_completed'",[batch.rows[0].id])).rowCount,1);}});

test("HTTP resource policy hides owner batches from other employees and permits admin/reviewer reads",async()=>{const owner="idor-owner";const batch=await pool.query<{id:string}>("insert into batches(name,source,created_by,status) values ('IDOR','csv',$1,'ready_for_employee') returning id",[owner]);const item=await pool.query<{id:string}>("insert into listing_items(batch_id,source_row_id,sku,original_values,normalized_values,question_configuration,status) values ($1,'IDOR','IDOR-SKU','{}','{\"manufacturer\":\"VTK\",\"model\":\"IDOR\",\"title\":\"IDOR\"}','{\"includedQuestions\":[],\"conditionRequired\":false,\"conditionalFields\":[]}','ready_for_employee') returning id",[batch.rows[0].id]);const phase2=new Phase2Service({store:async()=>{throw new Error("unused");}});const app=createApp({identityProvider:new PgHeaderIdentity(),itemWriteService:new ItemWriteService(new PostgresItemWriteRepository()),phase2Service:phase2});const server=await new Promise<import("node:http").Server>((resolve)=>{const value=app.listen(0,"127.0.0.1",()=>resolve(value));});try{const address=server.address();assert.ok(address&&typeof address==="object");const base=`http://127.0.0.1:${address.port}/api`;const headers=(user:string,role:string,key="idor")=>({"content-type":"application/json","x-test-user":user,"x-test-role":role,"idempotency-key":key});const other=headers("idor-other","employee");const list=await fetch(`${base}/batches`,{headers:other});assert.equal(list.status,200);assert.equal((await list.json() as {batches:unknown[]}).batches.length,0);for(const path of [`/batches/${batch.rows[0].id}`,`/batches/${batch.rows[0].id}/progress`,`/batches/${batch.rows[0].id}/items`,`/batches/${batch.rows[0].id}/next-item`,`/items/${item.rows[0].id}`])assert.equal((await fetch(`${base}${path}`,{headers:other})).status,404);const foreign=draft(item.rows[0].id,"idor-other");assert.equal((await fetch(`${base}/items/${item.rows[0].id}/draft`,{method:"PUT",headers:other,body:JSON.stringify({draft:foreign,expectedDraftVersion:0})})).status,404);assert.equal((await fetch(`${base}/items/${item.rows[0].id}/answer`,{method:"PUT",headers:other,body:JSON.stringify({draft:foreign})})).status,404);for(const [user,role] of [[owner,"employee"],["idor-admin","admin"],["idor-reviewer","reviewer"]])assert.equal((await fetch(`${base}/batches/${batch.rows[0].id}`,{headers:headers(user,role)})).status,200);assert.equal((await fetch(`${base}/items/${item.rows[0].id}/answer`,{method:"PUT",headers:headers("idor-reviewer","reviewer"),body:JSON.stringify({draft:draft(item.rows[0].id,"idor-reviewer")})})).status,403);}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}});

function randomCorrelation(iteration:number,suffix:number){return `00000000-0000-4000-8000-${String(100000000000+iteration*10+suffix).slice(-12)}`;}
