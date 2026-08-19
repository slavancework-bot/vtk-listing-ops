import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";

let server: Server; let baseUrl: string;
before(async () => {
  process.env.ALLOW_DEVELOPMENT_IDENTITY = "true";
  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address(); assert.ok(address && typeof address === "object"); baseUrl = `http://127.0.0.1:${address.port}/api`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); delete process.env.ALLOW_DEVELOPMENT_IDENTITY; });

test("published health route is public", async () => { assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200); });

for (const operation of [{ method: "PUT", path: "answer" }, { method: "POST", path: "needs-review" }] as const) {
  test(`${operation.method} ${operation.path} is mounted, protected, and UUID-validating`, async () => {
    assert.equal((await fetch(`${baseUrl}/items/00000000-0000-4000-8000-000000000001/${operation.path}`, { method: operation.method, headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    const invalid = await fetch(`${baseUrl}/items/not-a-uuid/${operation.path}`, { method: operation.method, headers: { "content-type": "application/json", "x-development-user": "employee-1", "idempotency-key": "route-test" }, body: "{}" });
    assert.equal(invalid.status, 400);
  });
}
