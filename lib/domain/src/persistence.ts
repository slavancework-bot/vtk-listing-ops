import type { ConditionalField, IncludedQuestion } from "./model";

export interface PersistedQuestionConfiguration {
  includedQuestions: IncludedQuestion[];
  conditionRequired: boolean;
  conditionalFields: ConditionalField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  for (const question of includedQuestions) {
    if (seenQuestions.has(question.id)) throw new Error("Persisted included question IDs must be unique.");
    seenQuestions.add(question.id);
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
      }
    }
    if (candidate.visibility !== undefined) {
      if (!isRecord(candidate.visibility)) throw new Error(`Persisted conditional field ${index} has invalid visibility.`);
      if (candidate.visibility.fieldId !== undefined && typeof candidate.visibility.fieldId !== "string") throw new Error(`Persisted conditional field ${index} has invalid visibility field.`);
      if (candidate.visibility.conditionIn !== undefined && (!Array.isArray(candidate.visibility.conditionIn) || candidate.visibility.conditionIn.some((code) => !allowedConditions.has(String(code))))) throw new Error(`Persisted conditional field ${index} has invalid visibility conditions.`);
    }
    return candidate as unknown as ConditionalField;
  });
  const seenFields = new Set<string>();
  for (const field of conditionalFields) {
    if (seenFields.has(field.id)) throw new Error("Persisted conditional field IDs must be unique.");
    seenFields.add(field.id);
  }
  return { includedQuestions, conditionRequired: value.conditionRequired, conditionalFields };
}
