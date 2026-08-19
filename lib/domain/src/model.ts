export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type BatchId = Brand<string, "BatchId">;
export type ListingItemId = Brand<string, "ListingItemId">;
export type EmployeeId = Brand<string, "EmployeeId">;
export type IncludedQuestionId = Brand<string, "IncludedQuestionId">;
export type ConditionalFieldId = Brand<string, "ConditionalFieldId">;

export type ConditionCode = "A" | "B" | "C" | "D";

export const CONDITION_LABELS: Record<ConditionCode, string> = {
  A: "NEW",
  B: "NEW OPEN BOX",
  C: "FACTORY SEALED",
  D: "USED",
};

export type ProcessingStatus =
  | "pending"
  | "ready_for_employee"
  | "in_progress"
  | "completed"
  | "needs_review"
  | "awaiting_processing"
  | "processing_failed"
  | "reviewed"
  | "exported";

export type DraftStatus = "new" | "editing" | "restored" | "submitted" | "needs_review";

export type ReviewReasonCode =
  | "inventory_discrepancy"
  | "item_damage"
  | "identity_uncertain"
  | "missing_information"
  | "workflow_exception"
  | "other";

export interface ReviewReason {
  code: ReviewReasonCode;
  note?: string;
}

export interface Batch {
  id: BatchId;
  name: string;
  source: "csv" | "manual" | "api";
  createdAt: string;
  status: ProcessingStatus;
  totalItemCount: number;
  completedCount: number;
  reviewCount: number;
  pendingCount: number;
  version: number;
}

export function hasConsistentBatchCounts(batch: Batch): boolean {
  return batch.totalItemCount >= 0 && batch.completedCount >= 0 && batch.reviewCount >= 0 && batch.pendingCount >= 0 &&
    batch.completedCount + batch.reviewCount + batch.pendingCount === batch.totalItemCount;
}

export interface IncludedQuestion {
  id: IncludedQuestionId;
  label: string;
  displayOrder: number;
  required: boolean;
  shortcutPosition?: number;
  important?: boolean;
}

export interface VisibilityRule {
  fieldId?: ConditionalFieldId;
  equals?: string | number | boolean;
  conditionIn?: ConditionCode[];
}

export interface NumericValidationRule {
  kind: "number";
  integer?: boolean;
  min?: number;
  max?: number;
}

export interface TextValidationRule {
  kind: "text";
  minLength?: number;
  maxLength?: number;
}

export interface BooleanValidationRule {
  kind: "boolean";
}

export type FieldValidationRule = NumericValidationRule | TextValidationRule | BooleanValidationRule;
export type ConditionalFieldKind = "qty_to_list" | "check_count" | "stock_total" | "other_notes" | "custom";

export interface ConditionalField {
  id: ConditionalFieldId;
  kind: ConditionalFieldKind;
  type: "number" | "text" | "boolean";
  label: string;
  displayOrder: number;
  required: boolean;
  editable: boolean;
  visibility?: VisibilityRule;
  validation?: FieldValidationRule;
  defaultValue?: string | number | boolean;
}

export function hasCompatibleFieldValidation(field: ConditionalField): boolean {
  return !field.validation || field.validation.kind === field.type;
}

export interface ListingItem {
  id: ListingItemId;
  batchId: BatchId;
  sourceRowId: string;
  sourceRowNumber?: number;
  sku: string;
  inventoryId?: string;
  itemId?: string;
  manufacturer: string;
  model: string;
  mpn?: string;
  title: string;
  shortDescription?: string;
  includedQuestions: IncludedQuestion[];
  conditionRequired: boolean;
  conditionalFields: ConditionalField[];
  sourceInventoryFields: Readonly<Record<string, unknown>>;
  warnings: string[];
  workflowStatus: ProcessingStatus;
  version: number;
}

export type FieldValue = string | number | boolean | null;

export interface IncludedItemsAnswer {
  selectedQuestionIds: IncludedQuestionId[];
  explicitlyNone: boolean;
}

export interface ItemDraft {
  itemId: ListingItemId;
  itemVersion: number;
  includedItems: IncludedItemsAnswer;
  conditionCode: ConditionCode | null;
  fieldValues: Record<string, FieldValue>;
  notes: string;
  employeeId: EmployeeId;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
  normalizedAnswer: ItemDraft;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "SYSTEM_ERROR"
  | "AI_PROCESSING_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  correlationId: string;
  fieldErrors?: Record<string, string[]>;
  currentVersion?: number;
}
