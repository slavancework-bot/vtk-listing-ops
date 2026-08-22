import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createPhase3Router } from "./phase3";
import type { Phase3Service } from "../services/phase3-service";

const uuid = "00000000-0000-4000-8000-000000000001";
async function withServer(run: (base: string) => Promise<void>) {
  const service = {
    import: async () => ({
      batchId: uuid,
      replayed: false,
      itemCount: 1,
      checksum: "a".repeat(64),
      schemaVersion: "sixbit-listing-v1",
    }),
    answer: async () => ({ itemId: uuid, replayed: false, exportReady: false }),
    review: async () => ({ itemId: uuid, replayed: false, exportReady: true }),
  } as unknown as Phase3Service;
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use((req, _res, next) => {
    req.identity = {
      subject: "employee",
      role: (req.header("x-role") ?? "employee") as
        "employee" | "reviewer" | "admin",
    };
    req.correlationId = uuid;
    next();
  });
  app.use("/api", createPhase3Router(service));
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status ?? 500).json({}),
  );
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}/api`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("Phase 3 generated runtime validators reject extra, oversized, and incomplete payloads", async () =>
  withServer(async (base) => {
    const json = { "content-type": "application/json" };
    const validImport = {
      importKey: "key",
      filename: "x.csv",
      mimeType: "text/csv",
      content: "SKU,Title\na,b",
    };
    assert.equal(
      (
        await fetch(`${base}/phase3/batches/import`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ ...validImport, extra: true }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/phase3/items/${uuid}/answers`, {
          method: "PUT",
          headers: { ...json, "idempotency-key": "x".repeat(201) },
          body: JSON.stringify({ answers: { "q:r2.required": "R2-X" } }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/phase3/items/${uuid}/review`, {
          method: "PUT",
          headers: {
            ...json,
            "x-role": "reviewer",
            "idempotency-key": "review",
          },
          body: JSON.stringify({
            status: "approved",
            reason: "ok",
            analysisVersion: 1,
            resolvedRuleIds: [],
            evidence: {},
            extra: true,
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/phase3/items/${uuid}/review`, {
          method: "PUT",
          headers: {
            ...json,
            "x-role": "reviewer",
            "idempotency-key": "review",
          },
          body: JSON.stringify({
            status: "approved",
            reason: "x".repeat(2001),
            analysisVersion: 1,
            resolvedRuleIds: [],
            evidence: {},
          }),
        })
      ).status,
      400,
    );
  }));
