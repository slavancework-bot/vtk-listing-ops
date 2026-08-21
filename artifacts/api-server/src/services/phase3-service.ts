import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  analyzeListing,
  exportSixBitCsv,
  importSixBitCsv,
  LISTING_RULESET_VERSION,
  SIXBIT_SCHEMA_VERSION,
  type Analysis,
  type CsvImport,
  type ImportedListing,
} from "@workspace/domain/phase3";
import {
  auditEvents,
  batches,
  db,
  importedFiles,
  idempotencyRecords,
  listingAnalyses,
  listingExports,
  listingItems,
  listingQuestions,
} from "@workspace/db";
import { ApiFault } from "../lib/errors";
import { safeFilename } from "./controlled-csv";
import type { FileStorage } from "./file-storage";
import type { Phase2Service } from "./phase2-service";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiFault(
      422,
      "VALIDATION_ERROR",
      "Persisted Phase 3 data is malformed.",
    );
  return value as Record<string, unknown>;
}
export class Phase3Service {
  constructor(
    private readonly storage: FileStorage,
    private readonly access: Phase2Service,
  ) {}
  async import(input: {
    actorId: string;
    role: string;
    importKey: string;
    filename: string;
    mimeType: string;
    content: string;
    name?: string;
    correlationId: string;
  }) {
    if (input.mimeType !== "text/csv" && !/\.csv$/i.test(input.filename))
      throw new ApiFault(
        415,
        "INVALID_FILE_TYPE",
        "Phase 3 accepts CSV files only.",
      );
    if (!input.importKey || input.importKey.length > 200)
      throw new ApiFault(
        400,
        "VALIDATION_ERROR",
        "A valid importKey is required.",
      );
    let parsed: CsvImport;
    try {
      parsed = importSixBitCsv(input.content);
    } catch (e) {
      throw new ApiFault(
        422,
        "INVALID_CSV",
        e instanceof Error ? e.message : "CSV is invalid.",
      );
    }
    const prior = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.createdBy, input.actorId),
          eq(batches.importKey, input.importKey),
        ),
      )
      .limit(1);
    if (prior[0]) {
      if (prior[0].sourceChecksum !== parsed.checksum)
        throw new ApiFault(
          409,
          "CONFLICT",
          "The import key was used for different content.",
        );
      return {
        batchId: prior[0].id,
        replayed: true,
        itemCount: parsed.rows.length,
        checksum: parsed.checksum,
        schemaVersion: SIXBIT_SCHEMA_VERSION,
      };
    }
    const bytes = Buffer.from(input.content, "utf8");
    const stored = await this.storage.store(bytes);
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${input.actorId}:phase3:${input.importKey}`}))`,
        );
        const raced = await tx
          .select()
          .from(batches)
          .where(
            and(
              eq(batches.createdBy, input.actorId),
              eq(batches.importKey, input.importKey),
            ),
          )
          .limit(1);
        if (raced[0]) {
          await stored.remove();
          return {
            batchId: raced[0].id,
            replayed: true,
            itemCount: parsed.rows.length,
            checksum: parsed.checksum,
            schemaVersion: SIXBIT_SCHEMA_VERSION,
          };
        }
        const [batch] = await tx
          .insert(batches)
          .values({
            name: input.name?.trim() || safeFilename(input.filename),
            source: "csv",
            createdBy: input.actorId,
            importKey: input.importKey,
            sourceChecksum: parsed.checksum,
            schemaVersion: SIXBIT_SCHEMA_VERSION,
            status: "awaiting_processing",
            sourceFileMetadata: {
              originalFilename: input.filename,
              safeFilename: safeFilename(input.filename),
              mimeType: input.mimeType,
              sizeBytes: bytes.length,
              checksum: parsed.checksum,
              storageKey: stored.key,
              headers: parsed.headers,
              mapping: parsed.mapping,
            },
          })
          .returning();
        await tx.insert(listingItems).values(
          parsed.rows.map((row) => ({
            batchId: batch.id,
            sourceRowId: `row-${row.rowNumber}`,
            sourceRowNumber: row.rowNumber,
            sku: row.normalized.sku,
            inventoryId: row.normalized.inventoryId || null,
            itemId: row.normalized.itemId || null,
            originalValues: row.original,
            normalizedValues: row.normalized as unknown as Record<
              string,
              unknown
            >,
            questionConfiguration: {
              includedQuestions: [],
              conditionRequired: false,
              conditionalFields: [],
            },
            warnings: [],
            status: "awaiting_processing" as const,
          })),
        );
        await tx.insert(importedFiles).values({
          batchId: batch.id,
          uploaderId: input.actorId,
          originalFilename: input.filename,
          safeFilename: safeFilename(input.filename),
          mimeType: input.mimeType,
          checksum: parsed.checksum,
          sizeBytes: bytes.length,
          storageKey: stored.key,
          status: "imported",
        });
        await tx.insert(auditEvents).values({
          batchId: batch.id,
          actorId: input.actorId,
          actorRole: input.role as "employee" | "reviewer" | "admin",
          action: "batch_import_created",
          correlationId: input.correlationId,
          newStatus: "awaiting_processing",
          metadata: {
            schemaVersion: SIXBIT_SCHEMA_VERSION,
            rowCount: parsed.rows.length,
            headers: parsed.headers,
          },
        });
        return {
          batchId: batch.id,
          replayed: false,
          itemCount: parsed.rows.length,
          checksum: parsed.checksum,
          schemaVersion: SIXBIT_SCHEMA_VERSION,
        };
      });
    } catch (e) {
      await stored.remove();
      throw e;
    }
  }
  async analyzeBatch(
    batchId: string,
    actorId: string,
    role: string,
    correlationId: string,
  ) {
    await this.access.getBatch(batchId, actorId, role);
    const items = await db
      .select()
      .from(listingItems)
      .where(eq(listingItems.batchId, batchId))
      .orderBy(asc(listingItems.sourceRowNumber));
    let pass = 0,
      verify = 0,
      processed = 0;
    for (const item of items) {
      const existing = await db
        .select()
        .from(listingAnalyses)
        .where(
          and(
            eq(listingAnalyses.itemId, item.id),
            eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
          ),
        )
        .limit(1);
      const answers = existing[0]?.employeeAnswers ?? {};
      const analysis = analyzeListing(item.normalizedValues as never, answers);
      if (analysis.exportReady) pass++;
      else verify++;
      if (existing[0]) continue;
      processed++;
      await db.transaction(async (tx) => {
        await tx
          .insert(listingAnalyses)
          .values({
            itemId: item.id,
            ruleVersion: LISTING_RULESET_VERSION,
            normalizedValues: analysis.normalized as unknown as Record<
              string,
              unknown
            >,
            results: analysis.results as unknown as Record<string, unknown>[],
            repairs: analysis.repairs as unknown as Record<string, unknown>[],
            employeeAnswers: answers,
            exportReady: analysis.exportReady,
          })
          .onConflictDoUpdate({
            target: [listingAnalyses.itemId, listingAnalyses.ruleVersion],
            set: {
              normalizedValues: analysis.normalized as unknown as Record<
                string,
                unknown
              >,
              results: analysis.results as unknown as Record<string, unknown>[],
              repairs: analysis.repairs as unknown as Record<string, unknown>[],
              exportReady: analysis.exportReady,
              version: sql`${listingAnalyses.version}+1`,
              updatedAt: new Date(),
            },
          });
        for (const q of analysis.questions)
          await tx
            .insert(listingQuestions)
            .values({
              id: q.id,
              itemId: item.id,
              ruleId: q.ruleId,
              configuration: q as unknown as Record<string, unknown>,
            })
            .onConflictDoNothing();
        await tx
          .update(listingItems)
          .set({
            status: analysis.exportReady ? "completed" : "ready_for_employee",
            updatedAt: new Date(),
          })
          .where(eq(listingItems.id, item.id));
      });
    }
    if (processed > 0)
      await db.insert(auditEvents).values({
        batchId,
        actorId,
        actorRole: role as "employee" | "reviewer" | "admin",
        action: "processing_completed",
        correlationId,
        metadata: {
          ruleVersion: LISTING_RULESET_VERSION,
          total: items.length,
          pass,
          verify,
        },
      });
    return {
      batchId,
      ruleVersion: LISTING_RULESET_VERSION,
      total: items.length,
      pass,
      verify,
      exportReady: pass,
      replayed: processed === 0,
    };
  }
  async getResult(itemId: string, actorId: string, role: string) {
    await this.access.requireItemAccess(itemId, actorId, role);
    const [analysis] = await db
      .select()
      .from(listingAnalyses)
      .where(
        and(
          eq(listingAnalyses.itemId, itemId),
          eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
        ),
      )
      .limit(1);
    if (!analysis)
      throw new ApiFault(404, "NOT_FOUND", "Item has not been analyzed.");
    const questions = await db
      .select()
      .from(listingQuestions)
      .where(eq(listingQuestions.itemId, itemId))
      .orderBy(asc(listingQuestions.createdAt));
    return { ...analysis, questions };
  }
  async answer(
    itemId: string,
    actorId: string,
    role: string,
    idempotencyKey: string,
    answers: Record<string, unknown>,
    correlationId: string,
  ) {
    if (!idempotencyKey)
      throw new ApiFault(
        400,
        "VALIDATION_ERROR",
        "Idempotency-Key is required.",
      );
    const answerEntries = Object.entries(answers);
    if (
      answerEntries.length === 0 ||
      answerEntries.length > 50 ||
      answerEntries.some(
        ([key, value]) =>
          key.length > 200 ||
          !["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "string" && value.length > 2_000) ||
          (typeof value === "number" && !Number.isSafeInteger(value)),
      )
    )
      throw new ApiFault(
        400,
        "VALIDATION_ERROR",
        "Answers must contain bounded primitive values.",
      );
    const item = await this.access.requireItemAccess(
      itemId,
      actorId,
      role,
      true,
    );
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ itemId, answers }))
      .digest("hex");
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:phase3-answer:${itemId}:${idempotencyKey}`}))`,
      );
      const [replay] = await tx
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.actorId, actorId),
            eq(idempotencyRecords.operation, "phase3_answer"),
            eq(idempotencyRecords.key, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new ApiFault(
            409,
            "CONFLICT",
            "The idempotency key was used for a different answer.",
          );
        return { ...replay.responseBody, replayed: true };
      }
      const [analysis] = await tx
        .select()
        .from(listingAnalyses)
        .where(
          and(
            eq(listingAnalyses.itemId, itemId),
            eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
          ),
        )
        .for("update")
        .limit(1);
      if (!analysis)
        throw new ApiFault(404, "NOT_FOUND", "Item has not been analyzed.");
      const knownQuestions = await tx
        .select()
        .from(listingQuestions)
        .where(eq(listingQuestions.itemId, itemId));
      const questionById = new Map(
        knownQuestions.map((question) => [
          question.id,
          asRecord(question.configuration),
        ]),
      );
      for (const [answerId, value] of answerEntries) {
        const question = questionById.get(answerId);
        if (!question)
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            `Unknown Phase 3 question: ${answerId}.`,
          );
        const expectedType =
          question.type === "text" || question.type === "select"
            ? "string"
            : question.type;
        if (expectedType !== typeof value)
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            `Answer type does not match ${answerId}.`,
          );
      }
      const merged = { ...analysis.employeeAnswers, ...answers };
      const rerun = analyzeListing(item.normalizedValues as never, merged);
      await tx
        .update(listingAnalyses)
        .set({
          employeeAnswers: merged,
          normalizedValues: rerun.normalized as unknown as Record<
            string,
            unknown
          >,
          results: rerun.results as unknown as Record<string, unknown>[],
          repairs: rerun.repairs as unknown as Record<string, unknown>[],
          exportReady: rerun.exportReady,
          version: sql`${listingAnalyses.version}+1`,
          updatedAt: new Date(),
        })
        .where(eq(listingAnalyses.id, analysis.id));
      for (const [id, value] of Object.entries(answers))
        await tx
          .update(listingQuestions)
          .set({
            answer: { value },
            answeredBy: actorId,
            answeredAt: new Date(),
          })
          .where(
            and(
              eq(listingQuestions.itemId, itemId),
              eq(listingQuestions.id, id),
            ),
          );
      await tx
        .update(listingItems)
        .set({
          status: rerun.exportReady ? "completed" : "needs_review",
          updatedAt: new Date(),
        })
        .where(eq(listingItems.id, itemId));
      await tx.insert(auditEvents).values({
        itemId,
        batchId: item.batchId,
        actorId,
        actorRole: role as "employee" | "admin",
        action: "employee_answer_saved",
        correlationId,
        metadata: {
          idempotencyKey,
          ruleVersion: LISTING_RULESET_VERSION,
          answerIds: Object.keys(answers),
        },
      });
      const response = {
        itemId,
        exportReady: rerun.exportReady,
        results: rerun.results,
        questions: rerun.questions,
        replayed: false,
      };
      await tx.insert(idempotencyRecords).values({
        key: idempotencyKey,
        actorId,
        operation: "phase3_answer",
        requestHash,
        responseStatus: 200,
        responseBody: response as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      return response;
    });
  }
  async review(
    itemId: string,
    actorId: string,
    role: string,
    idempotencyKey: string,
    decision: { status: "approved" | "unresolved"; reason: string },
    correlationId: string,
  ) {
    if (role !== "reviewer" && role !== "admin")
      throw new ApiFault(403, "FORBIDDEN", "Reviewer role is required.");
    if (
      !idempotencyKey ||
      !decision.reason?.trim() ||
      !["approved", "unresolved"].includes(decision.status)
    )
      throw new ApiFault(
        400,
        "VALIDATION_ERROR",
        "Idempotency key and reviewer reason are required.",
      );
    const item = await this.access.requireItemAccess(itemId, actorId, role);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:phase3-review:${itemId}:${idempotencyKey}`}))`,
      );
      const [analysis] = await tx
        .select()
        .from(listingAnalyses)
        .where(
          and(
            eq(listingAnalyses.itemId, itemId),
            eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
          ),
        )
        .for("update")
        .limit(1);
      if (!analysis)
        throw new ApiFault(404, "NOT_FOUND", "Item has not been analyzed.");
      const prior = analysis.reviewerDecision
        ? asRecord(analysis.reviewerDecision)
        : null;
      if (prior?.idempotencyKey === idempotencyKey)
        return { itemId, replayed: true, decision: prior };
      if (prior)
        throw new ApiFault(
          409,
          "CONFLICT",
          "Reviewer decision already exists.",
        );
      const saved = {
        ...decision,
        idempotencyKey,
        reviewerId: actorId,
        decidedAt: new Date().toISOString(),
      };
      await tx
        .update(listingAnalyses)
        .set({
          reviewerDecision: saved,
          exportReady: decision.status === "approved",
          version: sql`${listingAnalyses.version}+1`,
          updatedAt: new Date(),
        })
        .where(eq(listingAnalyses.id, analysis.id));
      await tx
        .update(listingItems)
        .set({
          status: decision.status === "approved" ? "reviewed" : "needs_review",
          updatedAt: new Date(),
        })
        .where(eq(listingItems.id, itemId));
      await tx.insert(auditEvents).values({
        itemId,
        batchId: item.batchId,
        actorId,
        actorRole: role,
        action: "review_resolved",
        correlationId,
        metadata: saved,
      });
      return { itemId, replayed: false, decision: saved };
    });
  }
  async exportBatch(batchId: string, actorId: string, role: string) {
    await this.access.getBatch(batchId, actorId, role);
    const [batch] = await db
      .select()
      .from(batches)
      .where(eq(batches.id, batchId));
    const items = await db
      .select()
      .from(listingItems)
      .where(eq(listingItems.batchId, batchId))
      .orderBy(asc(listingItems.sourceRowNumber));
    const analyses = await Promise.all(
      items.map(
        async (item) =>
          (
            await db
              .select()
              .from(listingAnalyses)
              .where(
                and(
                  eq(listingAnalyses.itemId, item.id),
                  eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
                ),
              )
              .limit(1)
          )[0],
      ),
    );
    if (analyses.some((a) => !a || !a.exportReady))
      throw new ApiFault(
        409,
        "CONFLICT",
        "Every row must be analyzed and resolved before export.",
      );
    const meta = asRecord(batch!.sourceFileMetadata);
    const imported: CsvImport = {
      schemaVersion: SIXBIT_SCHEMA_VERSION,
      headers: meta.headers as string[],
      mapping: meta.mapping as never,
      checksum: batch!.sourceChecksum!,
      rows: items.map(
        (item) =>
          ({
            rowNumber: item.sourceRowNumber!,
            original: item.originalValues,
            normalized: item.normalizedValues,
            unknownColumns: [],
          }) as unknown as ImportedListing,
      ),
    };
    const domainAnalyses = analyses.map(
      (a) =>
        ({
          ruleVersion: LISTING_RULESET_VERSION,
          normalized: a!.normalizedValues,
          repairs: a!.repairs,
          results: a!.results,
          questions: [],
          exportReady: true,
        }) as unknown as Analysis,
    );
    const output = exportSixBitCsv(imported, domainAnalyses);
    const reparsedOutput = importSixBitCsv(output.content);
    const diffs = items.flatMap((item, index) =>
      Object.keys(item.originalValues)
        .filter(
          (h) =>
            reparsedOutput.rows[index]!.original[h] !== item.originalValues[h],
        )
        .map((field) => ({
          itemId: item.id,
          field,
          before: item.originalValues[field],
          after: reparsedOutput.rows[index]!.original[field],
        })),
    );
    const [saved] = await db
      .insert(listingExports)
      .values({
        batchId,
        ruleVersion: LISTING_RULESET_VERSION,
        schemaVersion: SIXBIT_SCHEMA_VERSION,
        checksum: output.checksum,
        rowCount: output.rowCount,
        content: output.content,
        fieldDiffs: diffs,
        generatedBy: actorId,
      })
      .onConflictDoNothing()
      .returning();
    const [existing] = saved
      ? [saved]
      : await db
          .select()
          .from(listingExports)
          .where(
            and(
              eq(listingExports.batchId, batchId),
              eq(listingExports.checksum, output.checksum),
            ),
          )
          .limit(1);
    return {
      exportId: existing!.id,
      checksum: output.checksum,
      rowCount: output.rowCount,
      schemaVersion: SIXBIT_SCHEMA_VERSION,
      ruleVersion: LISTING_RULESET_VERSION,
      content: output.content,
      fieldDiffs: diffs,
    };
  }
}
