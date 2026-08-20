import type { ItemDraft, ListingItem, ReviewReason } from "@workspace/domain";
import type { ItemWriteResponse } from "@workspace/api-zod";
import type { AuditEventInput, ItemWriteRepository, ItemWriteTransaction } from "./item-write-service";

/** Development/test adapter only. Production startup refuses this adapter. */
export class InMemoryItemWriteRepository implements ItemWriteRepository {
  readonly items = new Map<string, ListingItem>();
  readonly answers = new Map<string, ItemDraft>();
  readonly reviews: Array<{ draft: ItemDraft; reason: ReviewReason }> = [];
  readonly audits: AuditEventInput[] = [];
  private readonly idempotency = new Map<string, { requestHash: string; response: ItemWriteResponse; expiresAt: number }>();
  private readonly synchronizationScopes = new Map<string, Promise<void>>();

  get activeIdempotencyRecordCount() { return this.idempotency.size; }
  get activeSynchronizationScopeCount() { return this.synchronizationScopes.size; }

  constructor(items: ListingItem[] = [], private readonly now: () => number = Date.now) { items.forEach((item) => this.items.set(item.id, item)); }
  async executeIdempotent(key: string, actorId: string, requestHash: string, work: (transaction: ItemWriteTransaction) => Promise<ItemWriteResponse>): Promise<ItemWriteResponse> {
    const scopedKey = `${actorId}:employee_item_write:${key}`;
    const predecessor = this.synchronizationScopes.get(scopedKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = predecessor.then(() => gate);
    this.synchronizationScopes.set(scopedKey, tail);
    await predecessor;
    try {
      const prior = this.idempotency.get(scopedKey);
      if (prior && prior.expiresAt <= this.now()) this.idempotency.delete(scopedKey);
      const active = this.idempotency.get(scopedKey);
      if (active) {
        if (active.requestHash !== requestHash) throw new (await import("../lib/errors")).ApiFault(409, "CONFLICT", "The idempotency key was already used for a different request.");
        return { ...active.response, replayed: true };
      }
      const tx: ItemWriteTransaction = {
        getItemForUpdate: async (itemId) => this.items.get(itemId) ?? null,
        saveAnswer: async (draft, status) => {
          const item = this.items.get(draft.itemId)!;
          const nextVersion = item.version + 1;
          this.answers.set(draft.itemId, { ...draft, status: status === "completed" ? "submitted" : "needs_review" });
          this.items.set(item.id, { ...item, version: nextVersion, workflowStatus: status });
          return nextVersion;
        },
        saveReview: async (draft, reason) => { this.reviews.push({ draft, reason }); },
        appendAudit: async (event) => { this.audits.push(event); },
        nextPendingItemId: async (batchId) => [...this.items.values()].find((item) => item.batchId === batchId && ["pending", "ready_for_employee", "in_progress"].includes(item.workflowStatus))?.id ?? null,
      };
      const response = await work(tx);
      this.idempotency.set(scopedKey, { requestHash, response, expiresAt: this.now() + 24 * 60 * 60 * 1000 });
      return response;
    } finally {
      release();
      if (this.synchronizationScopes.get(scopedKey) === tail) this.synchronizationScopes.delete(scopedKey);
    }
  }
}
