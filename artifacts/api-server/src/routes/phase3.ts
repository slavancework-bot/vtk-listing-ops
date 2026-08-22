import { Router } from "express";
import {
  AnswerPhase3QuestionsBody,
  AnswerPhase3QuestionsHeader,
  ImportPhase3BatchBody,
  ReviewPhase3ItemBody,
  ReviewPhase3ItemHeader,
} from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import { requireRole } from "../middleware/identity";
import { writeRateLimit } from "../middleware/security";
import type { Phase3Service } from "../services/phase3-service";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(v: unknown) {
  if (typeof v !== "string" || !uuid.test(v))
    throw new ApiFault(400, "VALIDATION_ERROR", "Route identifier is invalid.");
  return v;
}
function validated<T>(
  schema: {
    strict(): { safeParse(value: unknown): { success: boolean; data?: T } };
  },
  value: unknown,
  message: string,
): T {
  const parsed = schema.strict().safeParse(value);
  if (!parsed.success) throw new ApiFault(400, "VALIDATION_ERROR", message);
  return parsed.data!;
}
export function createPhase3Router(service: Phase3Service) {
  const r = Router();
  r.post(
    "/phase3/batches/import",
    requireRole("employee", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        const b = validated(
          ImportPhase3BatchBody,
          req.body,
          "Import request is invalid.",
        );
        res.status(201).json(
          await service.import({
            ...b,
            actorId: req.identity!.subject,
            role: req.identity!.role,
            correlationId: req.correlationId,
          }),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.post(
    "/phase3/batches/:batchId/analyze",
    requireRole("employee", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        res.json(
          await service.analyzeBatch(
            id(req.params.batchId),
            req.identity!.subject,
            req.identity!.role,
            req.correlationId,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.get(
    "/phase3/batches/:batchId/work",
    requireRole("employee", "reviewer", "admin"),
    async (req, res, next) => {
      try {
        const offset = Number(req.query.offset ?? 0),
          limit = Number(req.query.limit ?? 100);
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit))
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            "Pagination values must be integers.",
          );
        res.json(
          await service.getBatchWork(
            id(req.params.batchId),
            req.identity!.subject,
            req.identity!.role,
            offset,
            limit,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.get(
    "/phase3/items/:itemId/results",
    requireRole("employee", "reviewer", "admin"),
    async (req, res, next) => {
      try {
        res.json(
          await service.getResult(
            id(req.params.itemId),
            req.identity!.subject,
            req.identity!.role,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.put(
    "/phase3/items/:itemId/answers",
    requireRole("employee", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        const body = validated(
          AnswerPhase3QuestionsBody,
          req.body,
          "Answers are required.",
        );
        const header = validated(
          AnswerPhase3QuestionsHeader,
          { "Idempotency-Key": req.header("idempotency-key") },
          "A valid Idempotency-Key is required.",
        );
        res.json(
          await service.answer(
            id(req.params.itemId),
            req.identity!.subject,
            req.identity!.role,
            header["Idempotency-Key"],
            body.answers,
            req.correlationId,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.put(
    "/phase3/items/:itemId/review",
    requireRole("reviewer", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        const b = validated(
          ReviewPhase3ItemBody,
          req.body,
          "Review request is invalid.",
        );
        const header = validated(
          ReviewPhase3ItemHeader,
          { "Idempotency-Key": req.header("idempotency-key") },
          "A valid Idempotency-Key is required.",
        );
        res.json(
          await service.review(
            id(req.params.itemId),
            req.identity!.subject,
            req.identity!.role,
            header["Idempotency-Key"],
            b,
            req.correlationId,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.post(
    "/phase3/batches/:batchId/export",
    requireRole("reviewer", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        res.json(
          await service.exportBatch(
            id(req.params.batchId),
            req.identity!.subject,
            req.identity!.role,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  return r;
}
