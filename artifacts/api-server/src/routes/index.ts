import { Router, type IRouter } from "express";
import { createItemRouter } from "./items";
import { ItemWriteService } from "../services/item-write-service";
import { InMemoryItemWriteRepository } from "../services/in-memory-item-write-repository";
import { createPhase2Router } from "./phase2";
import type { Phase2Service } from "../services/phase2-service";
import type { Phase3Service } from "../services/phase3-service";
import { createPhase3Router } from "./phase3";

const itemWriteRepository = process.env.NODE_ENV === "production" || process.env.APP_ENV === "staging"
  ? new (await import("../services/postgres-item-write-repository")).PostgresItemWriteRepository()
  : new InMemoryItemWriteRepository();

export function createApiRouter(service: ItemWriteService, phase2Service?: Phase2Service, phase3Service?: Phase3Service): IRouter {
  const router: IRouter = Router();
  if (phase2Service) router.use(createPhase2Router(phase2Service));
  if (phase3Service) router.use(createPhase3Router(phase3Service));
  router.use(createItemRouter(service, phase2Service));
  return router;
}

let phase2Service: Phase2Service | undefined;
let phase3Service: Phase3Service | undefined;
if (process.env.APP_ENV === "staging") {
  const [{ Phase2Service }, { NonproductionFilesystemStorage }] = await Promise.all([import("../services/phase2-service"), import("../services/file-storage")]);
  phase2Service = new Phase2Service(new NonproductionFilesystemStorage());
  const { Phase3Service } = await import("../services/phase3-service");
  phase3Service = new Phase3Service(new NonproductionFilesystemStorage(), phase2Service);
}
export default createApiRouter(new ItemWriteService(itemWriteRepository), phase2Service, phase3Service);
