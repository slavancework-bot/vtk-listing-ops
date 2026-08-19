import { z } from "zod/v4";

export const ConditionCodeSchema = z.enum(["A", "B", "C", "D"]);
export const ReviewReasonCodeSchema = z.enum(["inventory_discrepancy", "item_damage", "identity_uncertain", "missing_information", "workflow_exception", "other"]);
export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const ItemDraftSchema = z.object({
  itemId: z.string().min(1), itemVersion: z.number().int().positive(), includedItems: z.object({ selectedQuestionIds: z.array(z.string()), explicitlyNone: z.boolean() }),
  conditionCode: ConditionCodeSchema.nullable(), fieldValues: z.record(z.string(), FieldValueSchema), notes: z.string(), employeeId: z.string().min(1),
  status: z.enum(["new", "editing", "restored", "submitted", "needs_review"]), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const SaveItemRequestSchema = z.object({ draft: ItemDraftSchema });
export const NeedsReviewRequestSchema = z.object({ draft: ItemDraftSchema, reason: z.object({ code: ReviewReasonCodeSchema, note: z.string().max(2000).optional() }) });
export const ItemWriteResponseSchema = z.object({ itemId: z.string(), itemVersion: z.number().int().positive(), status: z.enum(["completed", "needs_review"]), nextItemId: z.string().nullable(), replayed: z.boolean() });
export const ApiErrorSchema = z.object({ code: z.enum(["VALIDATION_ERROR", "CONFLICT", "SYSTEM_ERROR", "AI_PROCESSING_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED"]), message: z.string(), correlationId: z.string(), fieldErrors: z.record(z.string(), z.array(z.string())).optional(), currentVersion: z.number().int().optional() });
