import { Router, type IRouter } from "express";
import { createItemRouter } from "./items";
import { ItemWriteService } from "../services/item-write-service";
import { InMemoryItemWriteRepository } from "../services/in-memory-item-write-repository";

const itemWriteRepository = process.env.NODE_ENV === "production"
  ? new (await import("../services/postgres-item-write-repository")).PostgresItemWriteRepository()
  : new InMemoryItemWriteRepository();

export function createApiRouter(service: ItemWriteService): IRouter {
  const router: IRouter = Router();
  router.use(createItemRouter(service));
  return router;
}

export default createApiRouter(new ItemWriteService(itemWriteRepository));
