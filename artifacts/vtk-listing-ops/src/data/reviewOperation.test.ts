import { describe, expect, it } from "vitest";
import type { ItemDraft } from "@workspace/domain";
import { reviewSemanticPayload, type ReviewReason } from "./reviewOperation";

const draft: ItemDraft = {
  itemId: "00000000-0000-4000-8000-000000000001" as ItemDraft["itemId"], itemVersion: 1,
  employeeId: "employee" as ItemDraft["employeeId"], status: "editing",
  includedItems: { selectedQuestionIds: [], explicitlyNone: true }, conditionCode: "A",
  fieldValues: { qtyToList: "1", otherNotes: "original" }, notes: "note",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const reason: ReviewReason = { code: "workflow_exception", note: "Employee requested review." };

describe("reviewSemanticPayload", () => {
  it("treats timestamp-only changes and selected-question ordering as the same logical operation", () => {
    const changed = { ...draft, createdAt: "2027-01-01T00:00:00.000Z", updatedAt: "2027-01-01T00:00:00.000Z" };
    expect(reviewSemanticPayload(changed, reason)).toBe(reviewSemanticPayload(draft, reason));
    const selected = { ...draft, includedItems: { selectedQuestionIds: ["2", "1"] as never[], explicitlyNone: false } };
    const reordered = { ...selected, includedItems: { ...selected.includedItems, selectedQuestionIds: ["1", "2"] as never[] } };
    expect(reviewSemanticPayload(reordered, reason)).toBe(reviewSemanticPayload(selected, reason));
  });

  it.each([
    ["notes", { ...draft, notes: "changed" }, reason],
    ["condition", { ...draft, conditionCode: "B" as const }, reason],
    ["included NONE", { ...draft, includedItems: { selectedQuestionIds: [], explicitlyNone: false } }, reason],
    ["included selection", { ...draft, includedItems: { selectedQuestionIds: ["1" as never], explicitlyNone: false } }, reason],
    ["conditional value", { ...draft, fieldValues: { ...draft.fieldValues, otherNotes: "changed" } }, reason],
    ["reason", draft, { ...reason, code: "missing_information" }],
  ])("detects a changed %s operation", (_label, changedDraft, changedReason) => {
    expect(reviewSemanticPayload(changedDraft as ItemDraft, changedReason)).not.toBe(reviewSemanticPayload(draft, reason));
  });
});
