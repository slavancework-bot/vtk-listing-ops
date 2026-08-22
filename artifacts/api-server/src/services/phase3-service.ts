import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  analyzeListing,
  deriveExportReadiness,
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
    if (input.mimeType !== "text/csv" || !/\.csv$/i.test(input.filename))
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
          if (raced[0].sourceChecksum !== parsed.checksum)
            throw new ApiFault(
              409,
              "CONFLICT",
              "The import key was used for different content.",
            );
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
    const existingRows = items.length
      ? await db
          .select()
          .from(listingAnalyses)
          .where(
            and(
              inArray(
                listingAnalyses.itemId,
                items.map((i) => i.id),
              ),
              eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
            ),
          )
      : [];
    const existingByItem = new Map(
      existingRows.map((row) => [row.itemId, row]),
    );
    let pass = 0,
      verify = 0,
      processed = 0;
    const pending: Array<{
      item: (typeof items)[number];
      analysis: Analysis;
      answers: Record<string, unknown>;
    }> = [];
    for (const item of items) {
      const existing = existingByItem.get(item.id);
      const answers = existing?.employeeAnswers ?? {};
      const analysis = analyzeListing(item.normalizedValues as never, answers);
      if (analysis.exportReady) pass++;
      else verify++;
      if (existing) continue;
      processed++;
      pending.push({ item, analysis, answers });
    }
    if (pending.length)
      await db.transaction(async (tx) => {
        await tx
          .insert(listingAnalyses)
          .values(
            pending.map(({ item, analysis, answers }) => ({
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
            })),
          )
          .onConflictDoNothing();
        const saved = await tx
          .select({ id: listingAnalyses.id, itemId: listingAnalyses.itemId })
          .from(listingAnalyses)
          .where(
            and(
              inArray(
                listingAnalyses.itemId,
                pending.map(({ item }) => item.id),
              ),
              eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
            ),
          );
        const analysisIdByItem = new Map(
          saved.map((row) => [row.itemId, row.id]),
        );
        const questionValues = pending.flatMap(({ item, analysis }) =>
          analysis.questions.map((q) => ({
            id: q.id,
            itemId: item.id,
            analysisId: analysisIdByItem.get(item.id)!,
            ruleVersion: LISTING_RULESET_VERSION,
            ruleId: q.ruleId,
            displayOrder: q.displayOrder,
            lifecycleStatus: "active",
            configuration: q as unknown as Record<string, unknown>,
          })),
        );
        if (questionValues.length)
          await tx
            .insert(listingQuestions)
            .values(questionValues)
            .onConflictDoNothing();
        const completedIds = pending
          .filter(({ analysis }) => analysis.exportReady)
          .map(({ item }) => item.id);
        const employeeIds = pending
          .filter(({ analysis }) => !analysis.exportReady)
          .map(({ item }) => item.id);
        if (completedIds.length)
          await tx
            .update(listingItems)
            .set({ status: "completed", updatedAt: new Date() })
            .where(inArray(listingItems.id, completedIds));
        if (employeeIds.length)
          await tx
            .update(listingItems)
            .set({ status: "ready_for_employee", updatedAt: new Date() })
            .where(inArray(listingItems.id, employeeIds));
      });
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
      .where(
        and(
          eq(listingQuestions.analysisId, analysis.id),
          eq(listingQuestions.lifecycleStatus, "active"),
        ),
      )
      .orderBy(asc(listingQuestions.displayOrder));
    return { ...analysis, questions };
  }
  async getBatchWork(
    batchId: string,
    actorId: string,
    role: string,
    offset = 0,
    limit = 100,
  ) {
    await this.access.getBatch(batchId, actorId, role);
    const safeOffset = Math.max(0, Math.min(offset, 100_000));
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const items = await db
      .select()
      .from(listingItems)
      .where(eq(listingItems.batchId, batchId))
      .orderBy(asc(listingItems.sourceRowNumber))
      .offset(safeOffset)
      .limit(safeLimit);
    if (!items.length)
      return { batchId, offset: safeOffset, limit: safeLimit, results: [] };
    const analyses = await db
      .select()
      .from(listingAnalyses)
      .where(
        and(
          inArray(
            listingAnalyses.itemId,
            items.map((i) => i.id),
          ),
          eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
        ),
      );
    const questions = analyses.length
      ? await db
          .select()
          .from(listingQuestions)
          .where(
            and(
              inArray(
                listingQuestions.analysisId,
                analyses.map((a) => a.id),
              ),
              eq(listingQuestions.lifecycleStatus, "active"),
            ),
          )
          .orderBy(asc(listingQuestions.displayOrder))
      : [];
    const questionsByAnalysis = new Map<string, typeof questions>();
    for (const question of questions) {
      const group = questionsByAnalysis.get(question.analysisId) ?? [];
      group.push(question);
      questionsByAnalysis.set(question.analysisId, group);
    }
    const byItem = new Map(
      analyses.map((analysis) => [
        analysis.itemId,
        {
          ...analysis,
          questions: questionsByAnalysis.get(analysis.id) ?? [],
        },
      ]),
    );
    return {
      batchId,
      offset: safeOffset,
      limit: safeLimit,
      results: items.flatMap((item) => {
        const result = byItem.get(item.id);
        return result ? [{ item, result }] : [];
      }),
    };
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
        .where(
          and(
            eq(listingQuestions.analysisId, analysis.id),
            eq(listingQuestions.lifecycleStatus, "active"),
          ),
        );
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
        if (
          question.type === "select" &&
          (!Array.isArray(question.options) ||
            !question.options.includes(value))
        )
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            `Answer is not an allowed option for ${answerId}.`,
          );
        if (
          question.type === "number" &&
          ((typeof question.min === "number" &&
            (value as number) < question.min) ||
            (typeof question.max === "number" &&
              (value as number) > question.max))
        )
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            `Answer is outside the allowed range for ${answerId}.`,
          );
        if (
          typeof value === "string" &&
          (!value.trim() ||
            (typeof question.minLength === "number" &&
              value.trim().length < question.minLength) ||
            (typeof question.maxLength === "number" &&
              value.length > question.maxLength))
        )
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            `Answer text is outside the allowed bounds for ${answerId}.`,
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
            lifecycleStatus: "resolved",
          })
          .where(
            and(
              eq(listingQuestions.analysisId, analysis.id),
              eq(listingQuestions.id, id),
            ),
          );
      for (const q of rerun.questions)
        await tx
          .insert(listingQuestions)
          .values({
            id: q.id,
            itemId,
            analysisId: analysis.id,
            ruleVersion: LISTING_RULESET_VERSION,
            ruleId: q.ruleId,
            displayOrder: q.displayOrder,
            lifecycleStatus: "active",
            configuration: q as unknown as Record<string, unknown>,
          })
          .onConflictDoUpdate({
            target: [listingQuestions.analysisId, listingQuestions.id],
            set: {
              lifecycleStatus: "active",
              configuration: q as unknown as Record<string, unknown>,
              displayOrder: q.displayOrder,
            },
          });
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
    decision: {
      status: "approved" | "unresolved";
      reason: string;
      analysisVersion: number;
      resolvedRuleIds: string[];
      evidence: Record<string, string>;
    },
    correlationId: string,
  ) {
    if (role !== "reviewer" && role !== "admin")
      throw new ApiFault(403, "FORBIDDEN", "Reviewer role is required.");
    if (
      !idempotencyKey ||
      !decision.reason?.trim() ||
      !Number.isSafeInteger(decision.analysisVersion) ||
      !Array.isArray(decision.resolvedRuleIds) ||
      !decision.evidence ||
      typeof decision.evidence !== "object" ||
      !["approved", "unresolved"].includes(decision.status)
    )
      throw new ApiFault(
        400,
        "VALIDATION_ERROR",
        "Idempotency key and reviewer reason are required.",
      );
    const item = await this.access.requireItemAccess(itemId, actorId, role);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ itemId, decision }))
      .digest("hex");
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:phase3-review:${itemId}:${idempotencyKey}`}))`,
      );
      const [replay] = await tx
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.actorId, actorId),
            eq(idempotencyRecords.operation, "phase3_review"),
            eq(idempotencyRecords.key, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new ApiFault(
            409,
            "CONFLICT",
            "The idempotency key was used for a different review.",
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
      if (analysis.reviewerDecision)
        throw new ApiFault(
          409,
          "CONFLICT",
          "Reviewer decision already exists.",
        );
      if (analysis.version !== decision.analysisVersion)
        throw new ApiFault(
          409,
          "STALE_ANALYSIS",
          "The analysis changed; refresh before reviewing.",
        );
      const results = analysis.results as unknown as Analysis["results"];
      const resolvable = new Set(
        results
          .filter(
            (r) =>
              r.outcome === "VERIFY" &&
              r.resolutionClass === "REVIEWER_RESOLVABLE",
          )
          .map((r) => r.ruleId),
      );
      if (decision.resolvedRuleIds.some((id) => !resolvable.has(id)))
        throw new ApiFault(
          422,
          "INVALID_REVIEW_RESOLUTION",
          "Only current reviewer-resolvable rules may be resolved.",
        );
      if (decision.resolvedRuleIds.some((id) => !decision.evidence[id]?.trim()))
        throw new ApiFault(
          422,
          "INVALID_REVIEW_EVIDENCE",
          "Every resolved rule requires evidence.",
        );
      const exportReady =
        decision.status === "approved" &&
        deriveExportReadiness(results, decision.resolvedRuleIds);
      if (decision.status === "approved" && !exportReady)
        throw new ApiFault(
          422,
          "UNRESOLVED_EXPORT_GATES",
          "Hard-invalid or unresolved employee gates still block export.",
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
          exportReady,
          version: sql`${listingAnalyses.version}+1`,
          updatedAt: new Date(),
        })
        .where(eq(listingAnalyses.id, analysis.id));
      await tx
        .update(listingItems)
        .set({
          status: exportReady ? "reviewed" : "needs_review",
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
      const response = {
        itemId,
        exportReady,
        replayed: false,
        decision: saved,
      };
      await tx.insert(idempotencyRecords).values({
        key: idempotencyKey,
        actorId,
        operation: "phase3_review",
        requestHash,
        responseStatus: 200,
        responseBody: response as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      return response;
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
    const analysisRows = items.length
      ? await db
          .select()
          .from(listingAnalyses)
          .where(
            and(
              inArray(
                listingAnalyses.itemId,
                items.map((i) => i.id),
              ),
              eq(listingAnalyses.ruleVersion, LISTING_RULESET_VERSION),
            ),
          )
      : [];
    const byItem = new Map(analysisRows.map((a) => [a.itemId, a]));
    const analyses = items.map((item) => byItem.get(item.id));
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
    const allowedHeaders = new Set(
      Object.entries(imported.mapping)
        .filter(([, target]) =>
          ["Title", "eBay Description", "R2Code", "Check Count"].includes(
            String(target),
          ),
        )
        .map(([header]) => header),
    );
    const forbidden = diffs.filter((diff) => !allowedHeaders.has(diff.field));
    if (forbidden.length)
      throw new ApiFault(
        422,
        "EXPORT_FIELD_POLICY_VIOLATION",
        "Export attempted to mutate a pass-through or non-allowlisted field.",
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
              eq(listingExports.ruleVersion, LISTING_RULESET_VERSION),
              eq(listingExports.schemaVersion, SIXBIT_SCHEMA_VERSION),
            ),
          )
          .limit(1);
    if (saved)
      await db.insert(auditEvents).values({
        batchId,
        actorId,
        actorRole: role as "reviewer" | "admin",
        action: "listing_exported",
        correlationId: `phase3-export:${existing!.id}`,
        metadata: {
          exportId: existing!.id,
          checksum: output.checksum,
          rowCount: output.rowCount,
          ruleVersion: LISTING_RULESET_VERSION,
          schemaVersion: SIXBIT_SCHEMA_VERSION,
          changedFields: [...new Set(diffs.map((d) => d.field))],
        },
      });
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
