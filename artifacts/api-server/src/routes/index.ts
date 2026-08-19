import { Router, type IRouter } from "express";
import { createItemRouter } from "./items";
import { ItemWriteService } from "../services/item-write-service";
import { InMemoryItemWriteRepository } from "../services/in-memory-item-write-repository";

const router: IRouter = Router();
const itemWriteRepository = process.env.NODE_ENV === "production"
  ? new (await import("../services/postgres-item-write-repository")).PostgresItemWriteRepository()
  : new InMemoryItemWriteRepository();

router.use(createItemRouter(new ItemWriteService(itemWriteRepository)));

export default router;
