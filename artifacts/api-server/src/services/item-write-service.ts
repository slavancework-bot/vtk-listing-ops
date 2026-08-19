import { createHash } from "node:crypto";
import type { ItemDraft, ListingItem, ReviewReason } from "@workspace/domain";
import { canTransition, validateEmployeeAnswer } from "@workspace/domain";
import type { ItemWriteResponse } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";

export interface AuditEventInput { itemId: string; actorId: string; action: "employee_answer_saved" | "needs_review_selected"; previousStatus: string; newStatus: string; correlationId: string; }
export interface ItemWriteTransaction {
  getItemForUpdate(itemId: string): Promise<ListingItem | null>;
  saveAnswer(draft: ItemDraft, status: "completed" | "needs_review"): Promise<number>;
  saveReview?(draft: ItemDraft, reason: ReviewReason): Promise<void>;
  appendAudit(event: AuditEventInput): Promise<void>;
  nextPendingItemId(batchId: string): Promise<string | null>;
}
export interface ItemWriteRepository {
  executeIdempotent(key: string, actorId: string, requestHash: string, work: (transaction: ItemWriteTransaction) => Promise<ItemWriteResponse>): Promise<ItemWriteResponse>;
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export class ItemWriteService {
  constructor(private readonly repository: ItemWriteRepository) {}

  async save(input: { idempotencyKey: string; actorId: string; correlationId: string; draft: ItemDraft; reviewReason?: ReviewReason }): Promise<ItemWriteResponse> {
    if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new ApiFault(400, "VALIDATION_ERROR", "A valid Idempotency-Key header is required.");
    if (input.draft.employeeId !== input.actorId) throw new ApiFault(403, "FORBIDDEN", "Draft employee identity does not match the authenticated identity.");
    const requestHash = hash({ draft: input.draft, reviewReason: input.reviewReason ?? null });
    return this.repository.executeIdempotent(input.idempotencyKey, input.actorId, requestHash, async (tx) => {
      const item = await tx.getItemForUpdate(input.draft.itemId);
      if (!item) throw new ApiFault(404, "NOT_FOUND", "Listing item was not found.");
      if (item.version !== input.draft.itemVersion) throw new ApiFault(409, "CONFLICT", "The listing item changed after it was loaded.", { currentVersion: item.version });
      const validation = validateEmployeeAnswer(item, input.draft);
      if (!input.reviewReason && !validation.valid) throw new ApiFault(422, "VALIDATION_ERROR", "Employee answers are incomplete or invalid.", { fieldErrors: validation.fieldErrors });
      const status = input.reviewReason ? "needs_review" : "completed";
      if (!canTransition(item.workflowStatus, status)) throw new ApiFault(409, "CONFLICT", `Item cannot transition from ${item.workflowStatus} to ${status}.`, { currentVersion: item.version });
      const draftToSave = input.reviewReason ? input.draft : validation.normalizedAnswer;
      const itemVersion = await tx.saveAnswer(draftToSave, status);
      if (input.reviewReason) {
        if (!tx.saveReview) throw new ApiFault(500, "SYSTEM_ERROR", "Review persistence is unavailable.");
        await tx.saveReview(draftToSave, input.reviewReason);
      }
      await tx.appendAudit({ itemId: item.id, actorId: input.actorId, action: input.reviewReason ? "needs_review_selected" : "employee_answer_saved", previousStatus: item.workflowStatus, newStatus: status, correlationId: input.correlationId });
      return { itemId: item.id, itemVersion, status, nextItemId: await tx.nextPendingItemId(item.batchId), replayed: false } satisfies ItemWriteResponse;
    });
  }
}
