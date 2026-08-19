import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, auditEvents, idempotencyRecords, itemDrafts, listingItems, reviewRecords } from "@workspace/db";
import type { BatchId, ConditionalField, IncludedQuestion, ItemDraft, ListingItem, ListingItemId, ReviewReason } from "@workspace/domain";
import type { ItemWriteResponse } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import type { AuditEventInput, ItemWriteRepository, ItemWriteTransaction } from "./item-write-service";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toDomainItem(row: typeof listingItems.$inferSelect): ListingItem {
  const normalized = row.normalizedValues;
  const configuration = row.questionConfiguration;
  return {
    id: row.id as ListingItemId, batchId: row.batchId as BatchId, sourceRowId: row.sourceRowId, sourceRowNumber: row.sourceRowNumber ?? undefined,
    sku: row.sku, inventoryId: row.inventoryId ?? undefined, itemId: row.itemId ?? undefined,
    manufacturer: String(normalized.manufacturer ?? ""), model: String(normalized.model ?? ""), mpn: normalized.mpn ? String(normalized.mpn) : undefined,
    title: String(normalized.title ?? ""), shortDescription: normalized.shortDescription ? String(normalized.shortDescription) : undefined,
    includedQuestions: (configuration.includedQuestions ?? []) as IncludedQuestion[], conditionRequired: Boolean(configuration.conditionRequired),
    conditionalFields: (configuration.conditionalFields ?? []) as ConditionalField[], sourceInventoryFields: row.originalValues, warnings: row.warnings,
    workflowStatus: row.status, version: row.version,
  };
}

export class PostgresItemWriteRepository implements ItemWriteRepository {
  async executeIdempotent(key: string, actorId: string, requestHash: string, work: (transaction: ItemWriteTransaction) => Promise<ItemWriteResponse>): Promise<ItemWriteResponse> {
    return db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:${key}`}))`);
      const prior = await transaction.select().from(idempotencyRecords).where(eq(idempotencyRecords.key, key)).limit(1);
      if (prior[0]) {
        if (prior[0].actorId !== actorId || prior[0].requestHash !== requestHash) throw new ApiFault(409, "CONFLICT", "The idempotency key was already used for a different request.");
        return { ...(prior[0].responseBody as unknown as ItemWriteResponse), replayed: true };
      }
      const response = await work(this.createTransaction(transaction));
      await transaction.insert(idempotencyRecords).values({ key, actorId, operation: "employee_item_write", requestHash, responseStatus: 200, responseBody: response as unknown as Record<string, unknown>, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      return response;
    });
  }

  private createTransaction(transaction: DbTransaction): ItemWriteTransaction {
    let lockedItem: ListingItem | null = null;
    return {
      getItemForUpdate: async (itemId) => {
        const rows = await transaction.select().from(listingItems).where(eq(listingItems.id, itemId)).for("update").limit(1);
        lockedItem = rows[0] ? toDomainItem(rows[0]) : null;
        return lockedItem;
      },
      saveAnswer: async (draft, status) => {
        if (!lockedItem) throw new ApiFault(500, "SYSTEM_ERROR", "Item lock was not acquired.");
        const nextVersion = lockedItem.version + 1;
        await transaction.update(listingItems).set({ status, version: nextVersion, updatedAt: new Date() }).where(and(eq(listingItems.id, draft.itemId), eq(listingItems.version, draft.itemVersion)));
        const answer = draft as unknown as Record<string, unknown>;
        await transaction.insert(itemDrafts).values({ itemId: draft.itemId, employeeId: draft.employeeId, itemVersion: nextVersion, draftStatus: status === "completed" ? "submitted" : "needs_review", answer }).onConflictDoUpdate({ target: [itemDrafts.itemId, itemDrafts.employeeId], set: { itemVersion: nextVersion, draftStatus: status === "completed" ? "submitted" : "needs_review", answer, version: sql`${itemDrafts.version} + 1`, updatedAt: new Date() } });
        return nextVersion;
      },
      saveReview: async (draft: ItemDraft, reason: ReviewReason) => {
        if (!lockedItem) throw new ApiFault(500, "SYSTEM_ERROR", "Item lock was not acquired.");
        await transaction.insert(reviewRecords).values({ itemId: draft.itemId, employeeId: draft.employeeId, itemVersion: draft.itemVersion, reasonCode: reason.code, note: reason.note, enteredAnswer: draft as unknown as Record<string, unknown>, sourceState: lockedItem.sourceInventoryFields });
      },
      appendAudit: async (event: AuditEventInput) => {
        await transaction.insert(auditEvents).values({ itemId: event.itemId, batchId: lockedItem?.batchId, actorId: event.actorId, actorRole: "employee", action: event.action, previousStatus: event.previousStatus as ListingItem["workflowStatus"], newStatus: event.newStatus as ListingItem["workflowStatus"], correlationId: event.correlationId, metadata: {} });
      },
      nextPendingItemId: async (batchId) => {
        const rows = await transaction.select({ id: listingItems.id }).from(listingItems).where(and(eq(listingItems.batchId, batchId), inArray(listingItems.status, ["pending", "ready_for_employee", "in_progress"]))).orderBy(asc(listingItems.sourceRowNumber), asc(listingItems.createdAt)).limit(1);
        return rows[0]?.id ?? null;
      },
    };
  }
}
