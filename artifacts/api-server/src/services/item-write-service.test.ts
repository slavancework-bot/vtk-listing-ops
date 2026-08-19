import assert from "node:assert/strict";
import test from "node:test";
import type { BatchId, EmployeeId, IncludedQuestionId, ItemDraft, ListingItem, ListingItemId } from "@workspace/domain";
import { ApiFault } from "../lib/errors";
import { InMemoryItemWriteRepository } from "./in-memory-item-write-repository";
import { ItemWriteService } from "./item-write-service";

const item: ListingItem = { id: "item-1" as ListingItemId, batchId: "batch-1" as BatchId, sourceRowId: "1", sku: "SKU", manufacturer: "VTK", model: "M", title: "Item", includedQuestions: [{ id: "cord" as IncludedQuestionId, label: "Cord", displayOrder: 1, required: true }], conditionRequired: true, conditionalFields: [], sourceInventoryFields: {}, warnings: [], workflowStatus: "ready_for_employee", version: 1 };
const draft: ItemDraft = { itemId: item.id, itemVersion: 1, includedItems: { selectedQuestionIds: ["cord" as IncludedQuestionId], explicitlyNone: false }, conditionCode: "D", fieldValues: {}, notes: "", employeeId: "employee-1" as EmployeeId, status: "editing", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" };

test("an identical idempotency retry replays without duplicate answer or audit", async () => {
  const repository = new InMemoryItemWriteRepository([item]); const service = new ItemWriteService(repository);
  const first = await service.save({ idempotencyKey: "save-1", actorId: "employee-1", correlationId: "request-1", draft });
  const second = await service.save({ idempotencyKey: "save-1", actorId: "employee-1", correlationId: "request-2", draft });
  assert.equal(first.replayed, false); assert.equal(second.replayed, true); assert.equal(repository.answers.size, 1); assert.equal(repository.audits.length, 1);
});
test("reusing an idempotency key for a different request conflicts", async () => {
  const repository = new InMemoryItemWriteRepository([item]); const service = new ItemWriteService(repository);
  await service.save({ idempotencyKey: "save-1", actorId: "employee-1", correlationId: "request-1", draft });
  await assert.rejects(() => service.save({ idempotencyKey: "save-1", actorId: "employee-1", correlationId: "request-2", draft: { ...draft, notes: "changed" } }), (error: unknown) => error instanceof ApiFault && error.status === 409);
});
test("stale versions conflict", async () => {
  const repository = new InMemoryItemWriteRepository([{ ...item, version: 2 }]); const service = new ItemWriteService(repository);
  await assert.rejects(() => service.save({ idempotencyKey: "save-stale", actorId: "employee-1", correlationId: "request-1", draft }), (error: unknown) => error instanceof ApiFault && error.code === "CONFLICT");
});
test("Needs Review persists answers, reason, and one audit event", async () => {
  const repository = new InMemoryItemWriteRepository([item]); const service = new ItemWriteService(repository);
  const response = await service.save({ idempotencyKey: "review-1", actorId: "employee-1", correlationId: "request-1", draft: { ...draft, includedItems: { selectedQuestionIds: [], explicitlyNone: false }, conditionCode: null }, reviewReason: { code: "missing_information", note: "Cannot identify cord" } });
  assert.equal(response.status, "needs_review"); assert.equal(repository.reviews.length, 1); assert.equal(repository.audits[0].action, "needs_review_selected");
});
