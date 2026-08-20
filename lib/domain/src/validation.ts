import type { ConditionalField, FieldValue, ItemDraft, ListingItem, ValidationResult } from "./model";

function isVisible(field: ConditionalField, item: ListingItem, draft: ItemDraft): boolean {
  const rule = field.visibility;
  if (!rule) return true;
  if (rule.conditionIn && (!draft.conditionCode || !rule.conditionIn.includes(draft.conditionCode))) return false;
  if (rule.fieldId && draft.fieldValues[rule.fieldId] !== rule.equals) return false;
  return true;
}

function normalizeValue(field: ConditionalField, value: FieldValue): FieldValue {
  if (!field.editable && value === undefined) return field.defaultValue ?? null;
  if (field.type === "number") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (field.type === "boolean") {
    if (value === true || value === "true" || value === "TRUE") return true;
    if (value === false || value === "false" || value === "FALSE") return false;
    return value;
  }
  return typeof value === "string" ? value.trim() : value;
}

function isBlank(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || value === "";
}

export function validateEmployeeAnswer(item: ListingItem, draft: ItemDraft): ValidationResult {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  const visibleFields = item.conditionalFields.filter((field) => isVisible(field, item, draft));
  const applicableIds = new Set(visibleFields.map((field) => field.id as string));
  const normalizedValues: Record<string, FieldValue> = {};

  for (const field of visibleFields) {
    const value = normalizeValue(field, draft.fieldValues[field.id]);
    normalizedValues[field.id] = value;
    const errors: string[] = [];
    if (field.required && isBlank(value)) errors.push(`${field.label} is required.`);
    if (!isBlank(value) && field.validation?.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${field.label} must be a number.`);
      else {
        if (field.validation.integer && !Number.isInteger(value)) errors.push(`${field.label} must be a whole number.`);
        if (field.validation.min !== undefined && value < field.validation.min) errors.push(`${field.label} must be at least ${field.validation.min}.`);
        if (field.validation.max !== undefined && value > field.validation.max) errors.push(`${field.label} must be at most ${field.validation.max}.`);
      }
    }
    if (!isBlank(value) && field.validation?.kind === "text" && typeof value === "string") {
      if (field.validation.minLength !== undefined && value.length < field.validation.minLength) errors.push(`${field.label} is too short.`);
      if (field.validation.maxLength !== undefined && value.length > field.validation.maxLength) errors.push(`${field.label} is too long.`);
    }
    if (errors.length) fieldErrors[field.id] = errors;
  }

  const validQuestionIds = new Set(item.includedQuestions.map((question) => question.id as string));
  const selected = [...new Set(draft.includedItems.selectedQuestionIds)].filter((id) => validQuestionIds.has(id));
  if (selected.length !== draft.includedItems.selectedQuestionIds.length) {
    fieldErrors.includedItems = ["One or more selected included-item questions are invalid."];
  }
  if (selected.length > 0 && draft.includedItems.explicitlyNone) {
    fieldErrors.includedItems = [...(fieldErrors.includedItems ?? []), "Included selections cannot be combined with NONE."];
  }
  if (item.includedQuestions.length > 0 && selected.length === 0 && !draft.includedItems.explicitlyNone) {
    fieldErrors.includedItems = [...(fieldErrors.includedItems ?? []), "Included items must be answered."];
  }
  if (item.conditionRequired && !draft.conditionCode) fieldErrors.conditionCode = ["Condition is required."];
  if (draft.itemId !== item.id) formErrors.push("Draft item does not match the listing item.");
  if (draft.itemVersion !== item.version) formErrors.push("The item changed after this draft was loaded.");

  // Authoritative hidden-field policy: retain hidden values in the UI draft, but remove them from submission normalization.
  for (const [key, value] of Object.entries(draft.fieldValues)) {
    if (applicableIds.has(key) && !(key in normalizedValues)) normalizedValues[key] = value;
  }

  const normalizedAnswer: ItemDraft = {
    ...draft,
    includedItems: { selectedQuestionIds: selected, explicitlyNone: selected.length === 0 && draft.includedItems.explicitlyNone },
    fieldValues: normalizedValues,
    notes: draft.notes.trim(),
  };
  return { valid: Object.keys(fieldErrors).length === 0 && formErrors.length === 0, fieldErrors, formErrors, normalizedAnswer };
}
