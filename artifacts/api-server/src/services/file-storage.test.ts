import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { NonproductionFilesystemStorage } from "./file-storage";

const linuxOnly = { skip: process.platform !== "linux" };

function withStorageEnvironment() {
  const old = { node: process.env.NODE_ENV, app: process.env.APP_ENV, allow: process.env.ALLOW_NONPRODUCTION_STORAGE };
  process.env.NODE_ENV = "test";
  process.env.APP_ENV = "staging";
  process.env.ALLOW_NONPRODUCTION_STORAGE = "true";
  return () => {
    if (old.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.node;
    if (old.app === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = old.app;
    if (old.allow === undefined) delete process.env.ALLOW_NONPRODUCTION_STORAGE; else process.env.ALLOW_NONPRODUCTION_STORAGE = old.allow;
  };
}

test("unsupported platforms fail closed instead of using pathname-only storage", { skip: process.platform === "linux" }, async () => {
  const restore = withStorageEnvironment();
  try { await assert.rejects(() => new NonproductionFilesystemStorage(join(tmpdir(), "unsupported")).store(Buffer.from("safe")), /requires Linux directory-descriptor binding/); }
  finally { restore(); }
});

test("filesystem storage uses generated contained keys, removes exactly its file, and is production-forbidden", linuxOnly, async () => {
  const root = await mkdtemp(join(tmpdir(), "vtk-storage-")); const restore = withStorageEnvironment();
  try {
    const storage = new NonproductionFilesystemStorage(root); const stored = await storage.store(Buffer.from("safe"));
    assert.match(stored.key, /^[0-9a-f-]{36}\.csv$/); const target = resolve(root, stored.key); assert.ok(target.startsWith(`${resolve(root)}${sep}`)); assert.equal(await readFile(target, "utf8"), "safe");
    await stored.remove(); await assert.rejects(() => readFile(target)); process.env.APP_ENV = "production"; assert.throws(() => new NonproductionFilesystemStorage(root), /forbidden/);
  } finally { restore(); await rm(root, { recursive: true, force: true }); }
});

test("filesystem storage rejects symlink roots and nested symlink components", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-links-")); const outside = join(sandbox, "outside"); const rootLink = join(sandbox, "root-link"); const nestedParent = join(sandbox, "nested"); const nestedLink = join(nestedParent, "redirect"); const restore = withStorageEnvironment();
  try {
    await mkdir(outside); await mkdir(nestedParent); await symlink(outside, rootLink, "dir"); await symlink(outside, nestedLink, "dir");
    await assert.rejects(() => new NonproductionFilesystemStorage(rootLink).store(Buffer.from("escape")), /symbolic link|reparse-point/);
    await assert.rejects(() => new NonproductionFilesystemStorage(join(nestedLink, "child")).store(Buffer.from("escape")), /symbolic link|reparse-point/); assert.deepEqual(await readdir(outside), []);
  } finally { restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("directory binding defeats deterministic root replacement during create with zero external writes", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-create-race-")); const root = join(sandbox, "root"); const moved = join(sandbox, "moved-root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment();
  try {
    await mkdir(root); await mkdir(outside); await writeFile(marker, "external");
    const storage = new NonproductionFilesystemStorage(root, { afterCreateVerification: async () => { await rename(root, moved); await symlink(outside, root, "dir"); } });
    await assert.rejects(() => storage.store(Buffer.from("secret-content")), /root changed/);
    assert.deepEqual(await readdir(outside), ["marker.txt"]); assert.equal(await readFile(marker, "utf8"), "external"); assert.deepEqual(await readdir(moved), []);
  } finally { restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("directory binding defeats deterministic root replacement during remove with zero external deletes", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-remove-race-")); const root = join(sandbox, "root"); const moved = join(sandbox, "moved-root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment();
  try {
    await mkdir(root); await mkdir(outside); await writeFile(marker, "external");
    let replace = false; const storage = new NonproductionFilesystemStorage(root, { afterRemoveVerification: async () => { if (!replace) return; await rename(root, moved); await symlink(outside, root, "dir"); } });
    const stored = await storage.store(Buffer.from("safe")); replace = true; await assert.rejects(() => stored.remove(), /root changed/);
    assert.equal(await readFile(marker, "utf8"), "external"); assert.equal(await readFile(join(moved, stored.key), "utf8"), "safe"); assert.deepEqual(await readdir(outside), ["marker.txt"]);
  } finally { restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("filesystem removal refuses a redirected target and never deletes external content", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-remove-")); const root = join(sandbox, "root"); const external = join(sandbox, "external"); const marker = join(external, "marker.txt"); const restore = withStorageEnvironment();
  try {
    const storage = new NonproductionFilesystemStorage(root); const stored = await storage.store(Buffer.from("safe")); await mkdir(external); await writeFile(marker, "external"); await rm(join(root, stored.key)); await symlink(external, join(root, stored.key), "dir");
    await assert.rejects(() => stored.remove(), /too many symbolic links|not a regular file|ELOOP/i); assert.equal(await readFile(marker, "utf8"), "external");
  } finally { restore(); await rm(sandbox, { recursive: true, force: true }); }
});
