import assert from "node:assert/strict";
import test from "node:test";
import { calculateBatchProgress, canTransition, parsePersistedItemDraft, parsePersistedListingJson, parsePersistedQuestionConfiguration, validateEmployeeAnswer } from "./index";
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

test("persisted conditional configuration rejects invalid bounds, defaults, references, positions, and visibility types", () => {
  const base = { includedQuestions: [], conditionRequired: false };
  assert.throws(() => parsePersistedQuestionConfiguration({ ...base, conditionalFields: [{ id: "text", kind: "custom", type: "text", label: "Text", displayOrder: 1, required: false, editable: true, validation: { kind: "text", minLength: 5, maxLength: 2 } }] }), /inverted text bounds/);
  assert.throws(() => parsePersistedQuestionConfiguration({ ...base, conditionalFields: [{ id: "number", kind: "custom", type: "number", label: "Number", displayOrder: 1, required: false, editable: true, validation: { kind: "number", min: 10, max: 1 } }] }), /inverted numeric bounds/);
  assert.throws(() => parsePersistedQuestionConfiguration({ ...base, conditionalFields: [{ id: "flag", kind: "custom", type: "boolean", label: "Flag", displayOrder: 1, required: false, editable: true, defaultValue: "yes" }] }), /default value/);
  assert.throws(() => parsePersistedQuestionConfiguration({ ...base, conditionalFields: [{ id: "dependent", kind: "custom", type: "text", label: "Dependent", displayOrder: 1, required: false, editable: true, visibility: { fieldId: "missing", equals: true } }] }), /unknown visibility field/);
  assert.throws(() => parsePersistedQuestionConfiguration({ ...base, conditionalFields: [{ id: "flag", kind: "custom", type: "boolean", label: "Flag", displayOrder: 1, required: false, editable: true }, { id: "dependent", kind: "custom", type: "text", label: "Dependent", displayOrder: 2, required: false, editable: true, visibility: { fieldId: "flag", equals: "yes" } }] }), /visibility value/);
  assert.throws(() => parsePersistedQuestionConfiguration({ includedQuestions: [{ id: "a", label: "A", displayOrder: 1, required: false, shortcutPosition: 1 }, { id: "b", label: "B", displayOrder: 1, required: false, shortcutPosition: 1 }], conditionRequired: false, conditionalFields: [] }), /display positions|shortcut positions/);
});

test("other persisted JSON and stored drafts fail safely when malformed", () => {
  assert.deepEqual(parsePersistedListingJson({ manufacturer: "VTK", model: "M", title: "T" }, { source: 1 }, ["warning"]).warnings, ["warning"]);
  assert.throws(() => parsePersistedListingJson({ manufacturer: 1, model: "M", title: "T" }, {}, []), /normalized values/);
  assert.throws(() => parsePersistedListingJson({ manufacturer: "VTK", model: "M", title: "T" }, {}, [7]), /warnings/);
  assert.equal(parsePersistedItemDraft(draft({ includedItems: { selectedQuestionIds: [], explicitlyNone: true } })).status, "editing");
  assert.throws(() => parsePersistedItemDraft({ ...draft(), fieldValues: { bad: [] } }), /item draft/);
});
