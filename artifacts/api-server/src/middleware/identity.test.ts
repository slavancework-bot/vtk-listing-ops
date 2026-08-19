import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DevelopmentIdentityProvider } from "./identity";

function request(headers: Record<string, string> = {}) {
  return { header: (name: string) => headers[name.toLowerCase()] } as Request;
}

test("development identity is disabled by default", async () => {
  const previous = process.env.ALLOW_DEVELOPMENT_IDENTITY;
  delete process.env.ALLOW_DEVELOPMENT_IDENTITY;
  try { assert.equal(await new DevelopmentIdentityProvider().authenticate(request({ "x-development-user": "employee-1" })), null); }
  finally { if (previous === undefined) delete process.env.ALLOW_DEVELOPMENT_IDENTITY; else process.env.ALLOW_DEVELOPMENT_IDENTITY = previous; }
});

test("development identity requires an explicit flag and named subject", async () => {
  const previous = process.env.ALLOW_DEVELOPMENT_IDENTITY;
  process.env.ALLOW_DEVELOPMENT_IDENTITY = "true";
  try {
    assert.equal(await new DevelopmentIdentityProvider().authenticate(request()), null);
    assert.deepEqual(await new DevelopmentIdentityProvider().authenticate(request({ "x-development-user": "employee-1" })), { subject: "employee-1", role: "employee" });
  } finally { if (previous === undefined) delete process.env.ALLOW_DEVELOPMENT_IDENTITY; else process.env.ALLOW_DEVELOPMENT_IDENTITY = previous; }
});

test("development identity is forbidden in production even when flagged", async () => {
  const oldNode = process.env.NODE_ENV; const oldFlag = process.env.ALLOW_DEVELOPMENT_IDENTITY;
  process.env.NODE_ENV = "production"; process.env.ALLOW_DEVELOPMENT_IDENTITY = "true";
  try { assert.equal(await new DevelopmentIdentityProvider().authenticate(request({ "x-development-user": "employee-1" })), null); }
  finally { if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode; if (oldFlag === undefined) delete process.env.ALLOW_DEVELOPMENT_IDENTITY; else process.env.ALLOW_DEVELOPMENT_IDENTITY = oldFlag; }
});

test("production server startup fails closed without a trusted provider", async () => {
  const entry = fileURLToPath(new URL("../index.ts", import.meta.url));
  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", entry], { env: { ...process.env, NODE_ENV: "production", PORT: "39999", ALLOW_DEVELOPMENT_IDENTITY: "true" }, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = ""; child.stderr.on("data", (chunk) => { stderr += String(chunk); }); child.on("close", (code) => resolve({ code, stderr }));
  });
  assert.notEqual(result.code, 0); assert.match(result.stderr, /trusted identity|development identity adapter is forbidden/i);
});
