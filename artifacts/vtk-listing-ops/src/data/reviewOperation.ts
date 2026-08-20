import type { ItemDraft } from "@workspace/domain";

export interface ReviewReason { code: string; note?: string; }

function sortedRecord(values: ItemDraft["fieldValues"]) {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

export function reviewSemanticPayload(draft: ItemDraft, reason: ReviewReason) {
  return JSON.stringify({
    itemId: draft.itemId,
    itemVersion: draft.itemVersion,
    employeeId: draft.employeeId,
    status: draft.status,
    includedItems: {
      selectedQuestionIds: [...draft.includedItems.selectedQuestionIds].sort(),
      explicitlyNone: draft.includedItems.explicitlyNone,
    },
    conditionCode: draft.conditionCode,
    fieldValues: sortedRecord(draft.fieldValues),
    notes: draft.notes,
    reason,
  });
}
