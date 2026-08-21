import { Router, type Request } from "express";
import { GetBatchParams, GetBatchProgressParams, GetItemParams, GetNextPendingItemParams, ImportBatchBody, ListBatchItemsParams, SaveItemDraftBody, SaveItemDraftParams } from "@workspace/api-zod";
import { ApiFault } from "../lib/errors";
import { requireRole } from "../middleware/identity";
import { writeRateLimit } from "../middleware/security";
import type { Phase2Service } from "../services/phase2-service";

function id(schema: {safeParse(value: unknown): {success:true;data:{batchId?:string;itemId?:string}}|{success:false}}, value: unknown) { const parsed=schema.safeParse(value); if(!parsed.success) throw new ApiFault(400,"VALIDATION_ERROR","Route identifier is invalid."); return parsed.data.batchId ?? parsed.data.itemId!; }

export function createPhase2Router(service: Phase2Service) {
  const router = Router();
  const e2eFault = (req: Request, name: string) => process.env.PHASE2_E2E === "true" && process.env.NODE_ENV === "test" && process.env.APP_ENV === "staging" && req.header(name) === "true";
  router.post("/batches/import", requireRole("employee","admin"), writeRateLimit, async (req,res,next)=>{try{const parsed=ImportBatchBody.safeParse(req.body);if(!parsed.success)throw new ApiFault(400,"VALIDATION_ERROR","Import request is invalid.",{fieldErrors:{request:parsed.error.issues.map((i)=>i.message)}});res.status(201).json(await service.importBatch({...parsed.data,actorId:req.identity!.subject,role:req.identity!.role,correlationId:req.correlationId}));}catch(error){next(error);}});
  router.get("/batches", requireRole("employee","reviewer","admin"), async (req,res,next)=>{try{res.json({batches:await service.listBatches(req.identity!.subject,req.identity!.role)});}catch(error){next(error);}});
  router.get("/batches/:batchId", requireRole("employee","reviewer","admin"), async (req,res,next)=>{try{res.json(await service.getBatch(id(GetBatchParams,req.params),req.identity!.subject,req.identity!.role));}catch(error){next(error);}});
  router.get("/batches/:batchId/progress", requireRole("employee","reviewer","admin"), async (req,res,next)=>{try{if(e2eFault(req,"x-test-fail-progress"))throw new ApiFault(503,"SYSTEM_ERROR","Injected post-commit progress failure.");res.json(await service.getProgress(id(GetBatchProgressParams,req.params),req.identity!.subject,req.identity!.role));}catch(error){next(error);}});
  router.get("/batches/:batchId/items", requireRole("employee","reviewer","admin"), async (req,res,next)=>{try{res.json({items:await service.listItems(id(ListBatchItemsParams,req.params),req.identity!.subject,req.identity!.role)});}catch(error){next(error);}});
  router.get("/batches/:batchId/next-item", requireRole("employee","admin"), async (req,res,next)=>{try{res.json({item:await service.nextItem(id(GetNextPendingItemParams,req.params),req.identity!.subject,req.identity!.role)});}catch(error){next(error);}});
  router.get("/items/:itemId", requireRole("employee","reviewer","admin"), async (req,res,next)=>{try{res.json(await service.getItem(id(GetItemParams,req.params),req.identity!.subject,req.identity!.role));}catch(error){next(error);}});
  router.put("/items/:itemId/draft", requireRole("employee","admin"), writeRateLimit, async (req,res,next)=>{try{const itemId=id(SaveItemDraftParams,req.params);const parsed=SaveItemDraftBody.safeParse(req.body);if(!parsed.success)throw new ApiFault(400,"VALIDATION_ERROR","Draft request is invalid.");if(e2eFault(req,"x-test-fail-draft"))throw new ApiFault(503,"SYSTEM_ERROR","Injected required draft failure.");if(e2eFault(req,"x-test-delay-draft"))await new Promise((resolve)=>setTimeout(resolve,900));res.json(await service.saveDraft(itemId,req.identity!.subject,req.identity!.role,parsed.data.draft as unknown as Record<string,unknown>,Number((req.body as {expectedDraftVersion?:number}).expectedDraftVersion??0),req.correlationId));}catch(error){next(error);}});
  return router;
}
