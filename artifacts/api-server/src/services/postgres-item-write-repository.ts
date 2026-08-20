import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, auditEvents, batches, idempotencyRecords, itemDrafts, listingItems, reviewRecords } from "@workspace/db";
import { parsePersistedListingJson, parsePersistedQuestionConfiguration, type BatchId, type ItemDraft, type ListingItem, type ListingItemId, type ReviewReason } from "@workspace/domain";
import { SaveItemAnswerResponse, type ItemWriteResponse } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import type { AuditEventInput, ItemWriteRepository, ItemWriteTransaction } from "./item-write-service";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toDomainItem(row: typeof listingItems.$inferSelect): ListingItem {
  const persisted = parsePersistedListingJson(row.normalizedValues, row.originalValues, row.warnings);
  const normalized = persisted.normalizedValues;
  const configuration = row.questionConfiguration;
  const parsedConfiguration = parsePersistedQuestionConfiguration(configuration);
  return {
    id: row.id as ListingItemId, batchId: row.batchId as BatchId, sourceRowId: row.sourceRowId, sourceRowNumber: row.sourceRowNumber ?? undefined,
    sku: row.sku, inventoryId: row.inventoryId ?? undefined, itemId: row.itemId ?? undefined,
    manufacturer: String(normalized.manufacturer ?? ""), model: String(normalized.model ?? ""), mpn: normalized.mpn ? String(normalized.mpn) : undefined,
    title: String(normalized.title ?? ""), shortDescription: normalized.shortDescription ? String(normalized.shortDescription) : undefined,
    includedQuestions: parsedConfiguration.includedQuestions, conditionRequired: parsedConfiguration.conditionRequired,
    conditionalFields: parsedConfiguration.conditionalFields, sourceInventoryFields: persisted.originalValues, warnings: persisted.warnings,
    workflowStatus: row.status, version: row.version,
  };
}

export class PostgresItemWriteRepository implements ItemWriteRepository {
  async executeIdempotent(key: string, actorId: string, requestHash: string, work: (transaction: ItemWriteTransaction) => Promise<ItemWriteResponse>): Promise<ItemWriteResponse> {
    return db.transaction(async (transaction) => {
      const operation = "employee_item_write";
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:${operation}:${key}`}))`);
      await transaction.delete(idempotencyRecords).where(and(eq(idempotencyRecords.actorId, actorId), eq(idempotencyRecords.operation, operation), eq(idempotencyRecords.key, key), sql`${idempotencyRecords.expiresAt} <= now()`));
      const prior = await transaction.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.actorId, actorId), eq(idempotencyRecords.operation, operation), eq(idempotencyRecords.key, key))).limit(1);
      if (prior[0]) {
        if (prior[0].requestHash !== requestHash) throw new ApiFault(409, "CONFLICT", "The idempotency key was already used for a different request.");
        const stored = SaveItemAnswerResponse.parse(prior[0].responseBody);
        return { ...stored, replayed: true };
      }
      const response = await work(this.createTransaction(transaction));
      await transaction.insert(idempotencyRecords).values({ key, actorId, operation, requestHash, responseStatus: 200, responseBody: response as unknown as Record<string, unknown>, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
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
        const updated = await transaction.update(listingItems).set({ status, version: nextVersion, updatedAt: new Date() }).where(and(eq(listingItems.id, draft.itemId), eq(listingItems.version, draft.itemVersion))).returning({ id: listingItems.id });
        if (updated.length !== 1) throw new ApiFault(409, "CONFLICT", "The listing item changed before it could be saved.", { currentVersion: lockedItem.version });
        const answer = draft as unknown as Record<string, unknown>;
        await transaction.insert(itemDrafts).values({ itemId: draft.itemId, employeeId: draft.employeeId, itemVersion: nextVersion, draftStatus: status === "completed" ? "submitted" : "needs_review", answer }).onConflictDoUpdate({ target: [itemDrafts.itemId, itemDrafts.employeeId], set: { itemVersion: nextVersion, draftStatus: status === "completed" ? "submitted" : "needs_review", answer, version: sql`${itemDrafts.version} + 1`, updatedAt: new Date() } });
        const remaining=await transaction.select({count:sql<number>`count(*)::int`}).from(listingItems).where(and(eq(listingItems.batchId,lockedItem.batchId),inArray(listingItems.status,["pending","ready_for_employee","in_progress"])));
        if((remaining[0]?.count??0)===0)await transaction.update(batches).set({status:"completed",updatedAt:new Date(),version:sql`${batches.version}+1`}).where(eq(batches.id,lockedItem.batchId));
        return nextVersion;
      },
      saveReview: async (draft: ItemDraft, reason: ReviewReason) => {
        if (!lockedItem) throw new ApiFault(500, "SYSTEM_ERROR", "Item lock was not acquired.");
        await transaction.insert(reviewRecords).values({ itemId: draft.itemId, employeeId: draft.employeeId, sourceItemVersion: draft.itemVersion, resultingItemVersion: draft.itemVersion + 1, reasonCode: reason.code, note: reason.note, enteredAnswer: draft as unknown as Record<string, unknown>, sourceState: lockedItem.sourceInventoryFields });
      },
      appendAudit: async (event: AuditEventInput) => {
        await transaction.insert(auditEvents).values({ itemId: event.itemId, batchId: lockedItem?.batchId, actorId: event.actorId, actorRole: "employee", action: event.action, previousStatus: event.previousStatus as ListingItem["workflowStatus"], newStatus: event.newStatus as ListingItem["workflowStatus"], correlationId: event.correlationId, metadata: {} });
        if(lockedItem){const [batch]=await transaction.select({status:batches.status}).from(batches).where(eq(batches.id,lockedItem.batchId)).limit(1);if(batch?.status==="completed")await transaction.insert(auditEvents).values({batchId:lockedItem.batchId,actorId:event.actorId,actorRole:"employee",action:"batch_completed",previousStatus:"ready_for_employee",newStatus:"completed",correlationId:event.correlationId,metadata:{triggerItemId:event.itemId}});}
      },
      nextPendingItemId: async (batchId) => {
        const rows = await transaction.select({ id: listingItems.id }).from(listingItems).where(and(eq(listingItems.batchId, batchId), inArray(listingItems.status, ["pending", "ready_for_employee", "in_progress"]))).orderBy(asc(listingItems.sourceRowNumber), asc(listingItems.createdAt), asc(listingItems.id)).limit(1);
        return rows[0]?.id ?? null;
      },
    };
  }
}
