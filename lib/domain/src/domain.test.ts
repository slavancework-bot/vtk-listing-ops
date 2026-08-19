import assert from "node:assert/strict";
import test from "node:test";
import { calculateBatchProgress, canTransition, parsePersistedQuestionConfiguration, validateEmployeeAnswer } from "./index";
import type { BatchId, ConditionalFieldId, EmployeeId, IncludedQuestionId, ItemDraft, ListingItem, ListingItemId } from "./index";

const item: ListingItem = {
  id: "item-1" as ListingItemId,
  batchId: "batch-1" as BatchId,
  sourceRowId: "row-1",
  sku: "SKU-1",
  manufacturer: "VTK",
  model: "Example",
  title: "Example item",
  includedQuestions: [{ id: "power" as IncludedQuestionId, label: "Power cord", displayOrder: 1, required: true, shortcutPosition: 1 }],
  conditionRequired: true,
  conditionalFields: [{ id: "qtyToList" as ConditionalFieldId, kind: "qty_to_list", type: "number", label: "QTY TO LIST", displayOrder: 1, required: true, editable: true, validation: { kind: "number", integer: true, min: 1 } }],
  sourceInventoryFields: {}, warnings: [], workflowStatus: "ready_for_employee", version: 3,
};

function draft(overrides: Partial<ItemDraft> = {}): ItemDraft {
  return {
    itemId: item.id, itemVersion: 3,
    includedItems: { selectedQuestionIds: [], explicitlyNone: false },
    conditionCode: null, fieldValues: {}, notes: "", employeeId: "employee-1" as EmployeeId,
    status: "editing", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z", ...overrides,
  };
}

test("blank included answer is incomplete", () => assert.equal(validateEmployeeAnswer(item, draft()).valid, false));
test("one selection and valid required answers pass", () => assert.equal(validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: ["power" as IncludedQuestionId], explicitlyNone: false }, conditionCode: "D", fieldValues: { qtyToList: "2" } })).valid, true));
test("explicit NONE is complete", () => assert.equal(validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: "D", fieldValues: { qtyToList: 1 } })).valid, true));
test("selection plus NONE is rejected", () => assert.match(validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: ["power" as IncludedQuestionId], explicitlyNone: true } })).fieldErrors.includedItems.join(" "), /cannot be combined/));
test("invalid question IDs are rejected", () => assert.match(validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: ["unknown" as IncludedQuestionId], explicitlyNone: false } })).fieldErrors.includedItems.join(" "), /invalid/));
test("zero quantity is rejected and valid quantity is normalized", () => {
  const invalid = validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: "A", fieldValues: { qtyToList: "0" } }));
  assert.equal(invalid.valid, false);
  const valid = validateEmployeeAnswer(item, draft({ includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: "A", fieldValues: { qtyToList: "4" } }));
  assert.equal(valid.normalizedAnswer.fieldValues.qtyToList, 4);
});
test("hidden fields do not block validation and are removed from normalized submission", () => {
  const hiddenItem = { ...item, conditionalFields: [{ ...item.conditionalFields[0], visibility: { conditionIn: ["A" as const] } }] };
  const result = validateEmployeeAnswer(hiddenItem, draft({ includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: "D", fieldValues: { qtyToList: "bad" } }));
  assert.equal(result.valid, true);
  assert.equal(result.normalizedAnswer.fieldValues.qtyToList, undefined);
});
test("stale item versions are conflicts", () => assert.match(validateEmployeeAnswer(item, draft({ itemVersion: 2 })).formErrors.join(" "), /changed/));
test("workflow transitions and processed progress are deterministic", () => {
  assert.equal(canTransition("ready_for_employee", "completed"), true);
  assert.equal(canTransition("exported", "in_progress"), false);
  assert.deepEqual(calculateBatchProgress(["completed", "needs_review", "pending"]), { totalItemCount: 3, completedCount: 1, reviewCount: 1, processedCount: 2, pendingCount: 1, percent: 67, complete: false });
});

test("persisted question configuration is validated before domain use", () => {
  assert.deepEqual(parsePersistedQuestionConfiguration({ includedQuestions: [], conditionRequired: false, conditionalFields: [] }), { includedQuestions: [], conditionRequired: false, conditionalFields: [] });
  assert.throws(() => parsePersistedQuestionConfiguration({ includedQuestions: [{ id: "duplicate", label: "One", displayOrder: 1, required: true }, { id: "duplicate", label: "Two", displayOrder: 2, required: false }], conditionRequired: false, conditionalFields: [] }), /unique/i);
  assert.throws(() => parsePersistedQuestionConfiguration({ includedQuestions: [], conditionRequired: false, conditionalFields: [{ id: "bad", label: "Bad", type: "boolean", displayOrder: 1, required: false, editable: true, validation: { kind: "number" } }] }), /malformed|compatible/i);
});
