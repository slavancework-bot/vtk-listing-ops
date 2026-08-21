import { Router, type IRouter } from "express";
import { createItemRouter } from "./items";
import { ItemWriteService } from "../services/item-write-service";
import { InMemoryItemWriteRepository } from "../services/in-memory-item-write-repository";
import { createPhase2Router } from "./phase2";
import type { Phase2Service } from "../services/phase2-service";

const itemWriteRepository = process.env.NODE_ENV === "production" || process.env.APP_ENV === "staging"
  ? new (await import("../services/postgres-item-write-repository")).PostgresItemWriteRepository()
  : new InMemoryItemWriteRepository();

export function createApiRouter(service: ItemWriteService, phase2Service?: Phase2Service): IRouter {
  const router: IRouter = Router();
  if (phase2Service) router.use(createPhase2Router(phase2Service));
  router.use(createItemRouter(service, phase2Service));
  return router;
}

let phase2Service: Phase2Service | undefined;
if (process.env.APP_ENV === "staging") {
  const [{ Phase2Service }, { NonproductionFilesystemStorage }] = await Promise.all([import("../services/phase2-service"), import("../services/file-storage")]);
  phase2Service = new Phase2Service(new NonproductionFilesystemStorage());
}
export default createApiRouter(new ItemWriteService(itemWriteRepository), phase2Service);
