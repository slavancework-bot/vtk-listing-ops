import type { ConditionalField, FieldValue, IncludedQuestion, ItemDraft } from "./model";

export interface PersistedQuestionConfiguration {
  includedQuestions: IncludedQuestion[];
  conditionRequired: boolean;
  conditionalFields: ConditionalField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Persisted ${label} is malformed.`);
  return value;
}

export function parsePersistedListingJson(normalized: unknown, original: unknown, warnings: unknown) {
  const normalizedValues = assertJsonRecord(normalized, "normalized values");
  const originalValues = assertJsonRecord(original, "original values");
  if (typeof normalizedValues.manufacturer !== "string" || typeof normalizedValues.model !== "string" || typeof normalizedValues.title !== "string" ||
    (normalizedValues.mpn !== undefined && typeof normalizedValues.mpn !== "string") || (normalizedValues.shortDescription !== undefined && typeof normalizedValues.shortDescription !== "string")) {
    throw new Error("Persisted normalized values are malformed.");
  }
  if (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string")) throw new Error("Persisted warnings are malformed.");
  return { normalizedValues, originalValues, warnings: [...warnings] as string[] };
}

export function parsePersistedItemDraft(value: unknown): ItemDraft {
  const draft = assertJsonRecord(value, "item draft");
  const included = assertJsonRecord(draft.includedItems, "included answer");
  const fields = assertJsonRecord(draft.fieldValues, "draft field values");
  if (typeof draft.itemId !== "string" || !Number.isInteger(draft.itemVersion) || (draft.itemVersion as number) < 1 ||
    !Array.isArray(included.selectedQuestionIds) || included.selectedQuestionIds.some((id) => typeof id !== "string") || typeof included.explicitlyNone !== "boolean" ||
    ![null, "A", "B", "C", "D"].includes(draft.conditionCode as never) || typeof draft.notes !== "string" || typeof draft.employeeId !== "string" ||
    !["new", "editing", "restored", "submitted", "needs_review"].includes(String(draft.status)) || typeof draft.createdAt !== "string" || Number.isNaN(Date.parse(draft.createdAt)) ||
    typeof draft.updatedAt !== "string" || Number.isNaN(Date.parse(draft.updatedAt)) || Object.values(fields).some((field) => field !== null && !["string", "number", "boolean"].includes(typeof field))) {
    throw new Error("Persisted item draft is malformed.");
  }
  return draft as unknown as ItemDraft;
}

export function parsePersistedQuestionConfiguration(value: unknown): PersistedQuestionConfiguration {
  if (!isRecord(value) || !Array.isArray(value.includedQuestions) || typeof value.conditionRequired !== "boolean" || !Array.isArray(value.conditionalFields)) {
    throw new Error("Persisted question configuration is malformed.");
  }
  const includedQuestions = value.includedQuestions.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id || typeof candidate.label !== "string" || !candidate.label ||
      !Number.isInteger(candidate.displayOrder) || (candidate.displayOrder as number) < 1 || typeof candidate.required !== "boolean" ||
      (candidate.shortcutPosition !== undefined && (!Number.isInteger(candidate.shortcutPosition) || (candidate.shortcutPosition as number) < 1 || (candidate.shortcutPosition as number) > 10))) {
      throw new Error(`Persisted included question ${index} is malformed.`);
    }
    return candidate as unknown as IncludedQuestion;
  });
  const seenQuestions = new Set<string>();
  const seenQuestionOrders = new Set<number>();
  const seenShortcuts = new Set<number>();
  for (const question of includedQuestions) {
    if (seenQuestions.has(question.id)) throw new Error("Persisted included question IDs must be unique.");
    seenQuestions.add(question.id);
    if (seenQuestionOrders.has(question.displayOrder)) throw new Error("Persisted included question display positions must be unique.");
    seenQuestionOrders.add(question.displayOrder);
    if (question.shortcutPosition !== undefined) {
      if (seenShortcuts.has(question.shortcutPosition)) throw new Error("Persisted included question shortcut positions must be unique.");
      seenShortcuts.add(question.shortcutPosition);
    }
  }
  const allowedKinds = new Set(["qty_to_list", "check_count", "stock_total", "other_notes", "custom"]);
  const allowedTypes = new Set(["number", "text", "boolean"]);
  const allowedConditions = new Set(["A", "B", "C", "D"]);
  const conditionalFields = value.conditionalFields.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id || typeof candidate.label !== "string" || !candidate.label ||
      !allowedKinds.has(String(candidate.kind)) || !allowedTypes.has(String(candidate.type)) || !Number.isInteger(candidate.displayOrder) ||
      (candidate.displayOrder as number) < 1 || typeof candidate.required !== "boolean" || typeof candidate.editable !== "boolean") {
      throw new Error(`Persisted conditional field ${index} is malformed.`);
    }
    if (candidate.validation !== undefined) {
      if (!isRecord(candidate.validation) || candidate.validation.kind !== candidate.type) throw new Error(`Persisted conditional field ${index} has incompatible validation.`);
      if (candidate.type === "number") {
        for (const key of ["min", "max"] as const) if (candidate.validation[key] !== undefined && typeof candidate.validation[key] !== "number") throw new Error(`Persisted conditional field ${index} has invalid numeric bounds.`);
        if (candidate.validation.integer !== undefined && typeof candidate.validation.integer !== "boolean") throw new Error(`Persisted conditional field ${index} has invalid integer rule.`);
        if (typeof candidate.validation.min === "number" && typeof candidate.validation.max === "number" && candidate.validation.min > candidate.validation.max) throw new Error(`Persisted conditional field ${index} has inverted numeric bounds.`);
      } else if (candidate.type === "text") {
        for (const key of ["minLength", "maxLength"] as const) if (candidate.validation[key] !== undefined && (!Number.isInteger(candidate.validation[key]) || (candidate.validation[key] as number) < 0)) throw new Error(`Persisted conditional field ${index} has invalid text bounds.`);
        if (typeof candidate.validation.minLength === "number" && typeof candidate.validation.maxLength === "number" && candidate.validation.minLength > candidate.validation.maxLength) throw new Error(`Persisted conditional field ${index} has inverted text bounds.`);
      }
    }
    if (candidate.defaultValue !== undefined && typeof candidate.defaultValue !== candidate.type) throw new Error(`Persisted conditional field ${index} has an incompatible default value.`);
    if (candidate.visibility !== undefined) {
      if (!isRecord(candidate.visibility)) throw new Error(`Persisted conditional field ${index} has invalid visibility.`);
      if (candidate.visibility.fieldId !== undefined && typeof candidate.visibility.fieldId !== "string") throw new Error(`Persisted conditional field ${index} has invalid visibility field.`);
      if (candidate.visibility.conditionIn !== undefined && (!Array.isArray(candidate.visibility.conditionIn) || candidate.visibility.conditionIn.some((code) => !allowedConditions.has(String(code))))) throw new Error(`Persisted conditional field ${index} has invalid visibility conditions.`);
    }
    return candidate as unknown as ConditionalField;
  });
  const seenFields = new Set<string>();
  const seenFieldOrders = new Set<number>();
  for (const field of conditionalFields) {
    if (seenFields.has(field.id)) throw new Error("Persisted conditional field IDs must be unique.");
    seenFields.add(field.id);
    if (seenFieldOrders.has(field.displayOrder)) throw new Error("Persisted conditional field display positions must be unique.");
    seenFieldOrders.add(field.displayOrder);
  }
  const fieldById = new Map(conditionalFields.map((field) => [field.id, field]));
  for (const field of conditionalFields) {
    if (!field.visibility?.fieldId) continue;
    const referenced = fieldById.get(field.visibility.fieldId);
    if (!referenced) throw new Error(`Persisted conditional field ${field.id} references an unknown visibility field.`);
    if (field.visibility.equals !== undefined && typeof field.visibility.equals !== referenced.type) throw new Error(`Persisted conditional field ${field.id} has an incompatible visibility value.`);
  }
  return { includedQuestions, conditionRequired: value.conditionRequired, conditionalFields };
}
