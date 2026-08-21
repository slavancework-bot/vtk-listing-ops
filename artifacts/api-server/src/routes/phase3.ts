import { Router } from "express";
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
export function createPhase3Router(service: Phase3Service) {
  const r = Router();
  r.post(
    "/phase3/batches/import",
    requireRole("employee", "admin"),
    writeRateLimit,
    async (req, res, next) => {
      try {
        const b = req.body ?? {};
        if (
          !["importKey", "filename", "mimeType", "content"].every(
            (k) => typeof b[k] === "string",
          )
        )
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
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
        if (
          !req.body ||
          Object.keys(req.body).some((k) => k !== "answers") ||
          typeof req.body.answers !== "object" ||
          Array.isArray(req.body.answers)
        )
          throw new ApiFault(400, "VALIDATION_ERROR", "Answers are required.");
        res.json(
          await service.answer(
            id(req.params.itemId),
            req.identity!.subject,
            req.identity!.role,
            req.header("idempotency-key") ?? "",
            req.body.answers,
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
        const b = req.body;
        if (
          !b ||
          Object.keys(b).some(
            (k) =>
              ![
                "status",
                "reason",
                "analysisVersion",
                "resolvedRuleIds",
                "evidence",
              ].includes(k),
          ) ||
          !["approved", "unresolved"].includes(b.status) ||
          typeof b.reason !== "string" ||
          b.reason.length > 2000 ||
          !Number.isSafeInteger(b.analysisVersion) ||
          !Array.isArray(b.resolvedRuleIds) ||
          b.resolvedRuleIds.some((v: unknown) => typeof v !== "string") ||
          !b.evidence ||
          typeof b.evidence !== "object" ||
          Array.isArray(b.evidence) ||
          Object.values(b.evidence).some((v) => typeof v !== "string")
        )
          throw new ApiFault(
            400,
            "VALIDATION_ERROR",
            "Review request is invalid.",
          );
        res.json(
          await service.review(
            id(req.params.itemId),
            req.identity!.subject,
            req.identity!.role,
            req.header("idempotency-key") ?? "",
            req.body,
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
