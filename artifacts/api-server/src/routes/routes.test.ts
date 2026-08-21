import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import type { Request } from "express";
import {
  MarkItemNeedsReviewResponse,
  SaveItemAnswerResponse,
} from "@workspace/api-zod";
import type {
  BatchId,
  IncludedQuestionId,
  ListingItem,
  ListingItemId,
} from "@workspace/domain";
import { createApp } from "../app";
import type { IdentityProvider } from "../middleware/identity";
import { InMemoryItemWriteRepository } from "../services/in-memory-item-write-repository";
import { ItemWriteService } from "../services/item-write-service";
import type { Phase2Service } from "../services/phase2-service";
import { parseControlledCsv } from "../services/controlled-csv";

const answerId = "00000000-0000-4000-8000-000000000101";
const reviewId = "00000000-0000-4000-8000-000000000102";
const staleId = "00000000-0000-4000-8000-000000000103";
const invalidId = "00000000-0000-4000-8000-000000000104";
const batchId = "00000000-0000-4000-8000-000000000201" as BatchId;

function item(id: string, version = 1, requiredQuestion = false): ListingItem {
  return {
    id: id as ListingItemId,
    batchId,
    sourceRowId: id,
    sku: id,
    manufacturer: "VTK",
    model: "Synthetic",
    title: "Synthetic",
    includedQuestions: requiredQuestion
      ? [
          {
            id: "cord" as IncludedQuestionId,
            label: "Cord",
            displayOrder: 1,
            required: true,
          },
        ]
      : [],
    conditionRequired: false,
    conditionalFields: [],
    sourceInventoryFields: {},
    warnings: [],
    workflowStatus: "ready_for_employee",
    version,
  };
}

class HeaderIdentityProvider implements IdentityProvider {
  async authenticate(req: Request) {
    const subject = req.header("x-test-user");
    const role = req.header("x-test-role");
    if (!subject || !["employee", "reviewer", "admin"].includes(role ?? ""))
      return null;
    return { subject, role: role as "employee" | "reviewer" | "admin" };
  }
}

const repository = new InMemoryItemWriteRepository([
  item(answerId),
  item(reviewId),
  item(staleId, 2),
  item(invalidId, 1, true),
]);
let server: Server;
let baseUrl: string;
before(async () => {
  const phase2Service = {
    importBatch: async (input: {
      filename: string;
      mimeType: string;
      content: string;
    }) => {
      parseControlledCsv(input);
      throw new Error(
        "persistence should not be reached after file validation",
      );
    },
  } as unknown as Phase2Service;
  const app = createApp({
    identityProvider: new HeaderIdentityProvider(),
    itemWriteService: new ItemWriteService(repository),
    phase2Service,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
after(
  async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

function body(
  itemId: string,
  employeeId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    draft: {
      itemId,
      itemVersion: 1,
      includedItems: { selectedQuestionIds: [], explicitlyNone: true },
      conditionCode: null,
      fieldValues: {},
      notes: "route note",
      employeeId,
      status: "editing",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
      ...overrides,
    },
  };
}
function headers(user = "employee-1", role = "employee", key = "route-key") {
  return {
    "content-type": "application/json",
    "x-test-user": user,
    "x-test-role": role,
    "idempotency-key": key,
  };
}
async function expectFault(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const value = (await response.json()) as Record<string, unknown>;
  assert.equal(value.code, code);
  assert.equal(typeof value.message, "string");
  assert.match(String(value.correlationId), /^[0-9a-f-]{36}$/i);
  return value;
}

test("OpenAPI executable operations exactly match the mounted callable surface", async () => {
  const spec = await readFile(
    new URL("../../../../lib/api-spec/openapi.yaml", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    [...spec.matchAll(/^  (\/[^:]+):$/gm)].map((match) => match[1]),
    [
      "/healthz",
      "/readyz",
      "/batches/import",
      "/batches",
      "/batches/{batchId}",
      "/batches/{batchId}/progress",
      "/batches/{batchId}/items",
      "/batches/{batchId}/next-item",
      "/items/{itemId}",
      "/items/{itemId}/draft",
      "/items/{itemId}/answer",
      "/items/{itemId}/needs-review",
      "/phase3/batches/import",
      "/phase3/batches/{batchId}/analyze",
      "/phase3/batches/{batchId}/work",
      "/phase3/items/{itemId}/results",
      "/phase3/items/{itemId}/answers",
      "/phase3/items/{itemId}/review",
      "/phase3/batches/{batchId}/export",
    ],
  );
  for (const operation of [
    "healthCheck",
    "readinessCheck",
    "importBatch",
    "listBatches",
    "getBatch",
    "getBatchProgress",
    "listBatchItems",
    "getNextPendingItem",
    "getItem",
    "saveItemDraft",
    "saveItemAnswer",
    "markItemNeedsReview",
    "importPhase3Batch",
    "analyzePhase3Batch",
    "getPhase3Results",
    "answerPhase3Questions",
    "reviewPhase3Item",
    "exportPhase3Batch",
  ])
    assert.match(spec, new RegExp(`operationId: ${operation}`));
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});

test("valid employee final save and admin Needs Review validate against generated response schemas", async () => {
  const answer = await fetch(`${baseUrl}/items/${answerId}/answer`, {
    method: "PUT",
    headers: headers("employee-1", "employee", "answer-success"),
    body: JSON.stringify(body(answerId, "employee-1")),
  });
  assert.equal(answer.status, 200);
  assert.equal(
    SaveItemAnswerResponse.parse(await answer.json()).status,
    "completed",
  );
  const review = await fetch(`${baseUrl}/items/${reviewId}/needs-review`, {
    method: "POST",
    headers: headers("admin-1", "admin", "review-success"),
    body: JSON.stringify({
      ...body(reviewId, "admin-1"),
      reason: { code: "other", note: "Needs verification" },
    }),
  });
  assert.equal(review.status, 200);
  assert.equal(
    MarkItemNeedsReviewResponse.parse(await review.json()).status,
    "needs_review",
  );
});

test("structured 400, 401, 403, 404, 409, and 422 errors include correlation IDs", async () => {
  await expectFault(
    await fetch(`${baseUrl}/items/not-a-uuid/answer`, {
      method: "PUT",
      headers: headers(),
      body: "{}",
    }),
    400,
    "VALIDATION_ERROR",
  );
  await expectFault(
    await fetch(`${baseUrl}/items/${answerId}/answer`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    401,
    "UNAUTHORIZED",
  );
  await expectFault(
    await fetch(`${baseUrl}/items/${answerId}/answer`, {
      method: "PUT",
      headers: headers("reviewer-1", "reviewer"),
      body: JSON.stringify(body(answerId, "reviewer-1")),
    }),
    403,
    "FORBIDDEN",
  );
  await expectFault(
    await fetch(
      `${baseUrl}/items/00000000-0000-4000-8000-000000000999/answer`,
      {
        method: "PUT",
        headers: headers("employee-1", "employee", "missing"),
        body: JSON.stringify(
          body("00000000-0000-4000-8000-000000000999", "employee-1"),
        ),
      },
    ),
    404,
    "NOT_FOUND",
  );
  const stale = await expectFault(
    await fetch(`${baseUrl}/items/${staleId}/answer`, {
      method: "PUT",
      headers: headers("employee-1", "employee", "stale"),
      body: JSON.stringify(body(staleId, "employee-1")),
    }),
    409,
    "CONFLICT",
  );
  assert.equal(stale.currentVersion, 2);
  await expectFault(
    await fetch(`${baseUrl}/items/${invalidId}/answer`, {
      method: "PUT",
      headers: headers("employee-1", "employee", "invalid"),
      body: JSON.stringify(
        body(invalidId, "employee-1", {
          includedItems: { selectedQuestionIds: [], explicitlyNone: false },
        }),
      ),
    }),
    422,
    "VALIDATION_ERROR",
  );
});

test("draft identity mismatch is 403 and changed idempotent payload is 409", async () => {
  const mismatchId = "00000000-0000-4000-8000-000000000105";
  repository.items.set(mismatchId, item(mismatchId));
  await expectFault(
    await fetch(`${baseUrl}/items/${mismatchId}/answer`, {
      method: "PUT",
      headers: headers("employee-1", "employee", "mismatch"),
      body: JSON.stringify(body(mismatchId, "someone-else")),
    }),
    403,
    "FORBIDDEN",
  );
  const idempotentId = "00000000-0000-4000-8000-000000000106";
  repository.items.set(idempotentId, item(idempotentId));
  const first = await fetch(`${baseUrl}/items/${idempotentId}/answer`, {
    method: "PUT",
    headers: headers("employee-1", "employee", "conflicting-key"),
    body: JSON.stringify(body(idempotentId, "employee-1")),
  });
  assert.equal(first.status, 200);
  await expectFault(
    await fetch(`${baseUrl}/items/${idempotentId}/answer`, {
      method: "PUT",
      headers: headers("employee-1", "employee", "conflicting-key"),
      body: JSON.stringify(
        body(idempotentId, "employee-1", { notes: "changed" }),
      ),
    }),
    409,
    "CONFLICT",
  );
});

test("write rate limit returns structured 429", async () => {
  let response: Response | undefined;
  for (let index = 0; index < 121; index += 1)
    response = await fetch(`${baseUrl}/items/not-a-uuid/answer`, {
      method: "PUT",
      headers: headers("rate-user", "employee", `rate-${index}`),
      body: "{}",
    });
  assert.ok(response);
  await expectFault(response, 429, "RATE_LIMITED");
});

test("Phase 2 routes enforce generated validation, roles, UUIDs, and upload type before persistence", async () => {
  await expectFault(
    await fetch(`${baseUrl}/batches/not-a-uuid/progress`, {
      headers: { "x-test-user": "employee-2", "x-test-role": "employee" },
    }),
    400,
    "VALIDATION_ERROR",
  );
  await expectFault(
    await fetch(`${baseUrl}/batches/import`, {
      method: "POST",
      headers: headers("reviewer-2", "reviewer", "import-role"),
      body: JSON.stringify({
        importKey: "role",
        filename: "x.csv",
        mimeType: "text/csv",
        content: "x",
      }),
    }),
    403,
    "FORBIDDEN",
  );
  await expectFault(
    await fetch(`${baseUrl}/batches/import`, {
      method: "POST",
      headers: headers("employee-2", "employee", "import-type"),
      body: JSON.stringify({
        importKey: "bad-type",
        filename: "../../payload.exe",
        mimeType: "application/octet-stream",
        content: "not csv",
      }),
    }),
    415,
    "INVALID_FILE_TYPE",
  );
});
