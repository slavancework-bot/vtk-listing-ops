import { Router } from "express";
import { NeedsReviewRequestSchema, SaveItemRequestSchema } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import { requireRole } from "../middleware/identity";
import { writeRateLimit } from "../middleware/security";
import type { ItemWriteService } from "../services/item-write-service";
import type { ItemDraft } from "@workspace/domain";

export function createItemRouter(service: ItemWriteService) {
  const router = Router();
  router.put("/items/:itemId/answer", requireRole("employee", "admin"), writeRateLimit, async (req, res, next) => {
    try {
      const parsed = SaveItemRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ApiFault(400, "VALIDATION_ERROR", "Request body is invalid.", { fieldErrors: { request: parsed.error.issues.map((issue) => issue.message) } });
      if (parsed.data.draft.itemId !== req.params.itemId) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID does not match the draft item ID.");
      res.json(await service.save({ idempotencyKey: req.header("idempotency-key") ?? "", actorId: req.identity!.subject, correlationId: req.correlationId, draft: parsed.data.draft as ItemDraft }));
    } catch (error) { next(error); }
  });
  router.post("/items/:itemId/needs-review", requireRole("employee", "admin"), writeRateLimit, async (req, res, next) => {
    try {
      const parsed = NeedsReviewRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ApiFault(400, "VALIDATION_ERROR", "Request body is invalid.", { fieldErrors: { request: parsed.error.issues.map((issue) => issue.message) } });
      if (parsed.data.draft.itemId !== req.params.itemId) throw new ApiFault(400, "VALIDATION_ERROR", "Route item ID does not match the draft item ID.");
      res.json(await service.save({ idempotencyKey: req.header("idempotency-key") ?? "", actorId: req.identity!.subject, correlationId: req.correlationId, draft: parsed.data.draft as ItemDraft, reviewReason: parsed.data.reason }));
    } catch (error) { next(error); }
  });
  return router;
}
