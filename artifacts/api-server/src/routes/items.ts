import { Router } from "express";
import { MarkItemNeedsReviewBody, MarkItemNeedsReviewParams, SaveItemAnswerBody, SaveItemAnswerParams } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import { requireRole } from "../middleware/identity";
import { writeRateLimit } from "../middleware/security";
import type { ItemWriteService } from "../services/item-write-service";
import type { ItemDraft } from "@workspace/domain";

export function createItemRouter(service: ItemWriteService) {
  const router = Router();
  router.put("/items/:itemId/answer", requireRole("employee", "admin"), writeRateLimit, async (req, res, next) => {
    try {
      const params = SaveItemAnswerParams.safeParse(req.params);
      const parsed = SaveItemAnswerBody.safeParse(req.body);
      if (!params.success) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID is invalid.");
      if (!parsed.success) throw new ApiFault(400, "VALIDATION_ERROR", "Request body is invalid.", { fieldErrors: { request: parsed.error.issues.map((issue) => issue.message) } });
      if (parsed.data.draft.itemId !== params.data.itemId) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID does not match the draft item ID.");
      const draft = { ...parsed.data.draft, createdAt: parsed.data.draft.createdAt.toISOString(), updatedAt: parsed.data.draft.updatedAt.toISOString() } as ItemDraft;
      res.json(await service.save({ idempotencyKey: req.header("idempotency-key") ?? "", actorId: req.identity!.subject, correlationId: req.correlationId, draft }));
    } catch (error) { next(error); }
  });
  router.post("/items/:itemId/needs-review", requireRole("employee", "admin"), writeRateLimit, async (req, res, next) => {
    try {
      const params = MarkItemNeedsReviewParams.safeParse(req.params);
      const parsed = MarkItemNeedsReviewBody.safeParse(req.body);
      if (!params.success) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID is invalid.");
      if (!parsed.success) throw new ApiFault(400, "VALIDATION_ERROR", "Request body is invalid.", { fieldErrors: { request: parsed.error.issues.map((issue) => issue.message) } });
      if (parsed.data.draft.itemId !== params.data.itemId) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID does not match the draft item ID.");
      const draft = { ...parsed.data.draft, createdAt: parsed.data.draft.createdAt.toISOString(), updatedAt: parsed.data.draft.updatedAt.toISOString() } as ItemDraft;
      res.json(await service.save({ idempotencyKey: req.header("idempotency-key") ?? "", actorId: req.identity!.subject, correlationId: req.correlationId, draft, reviewReason: parsed.data.reason }));
    } catch (error) { next(error); }
  });
  return router;
}
