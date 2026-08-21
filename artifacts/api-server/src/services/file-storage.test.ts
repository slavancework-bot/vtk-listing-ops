import assert from "node:assert/strict";
import test from "node:test";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { NonproductionFilesystemStorage } from "./file-storage";

const linuxOnly = { skip: process.platform !== "linux" };

function withStorageEnvironment() {
  const old = { node: process.env.NODE_ENV, app: process.env.APP_ENV, allow: process.env.ALLOW_NONPRODUCTION_STORAGE };
  process.env.NODE_ENV = "test"; process.env.APP_ENV = "staging"; process.env.ALLOW_NONPRODUCTION_STORAGE = "true";
  return () => {
    if (old.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.node;
    if (old.app === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = old.app;
    if (old.allow === undefined) delete process.env.ALLOW_NONPRODUCTION_STORAGE; else process.env.ALLOW_NONPRODUCTION_STORAGE = old.allow;
  };
}

test("unsupported platforms fail closed instead of using pathname-only storage", { skip: process.platform === "linux" }, async () => {
  const restore = withStorageEnvironment();
  try { await assert.rejects(() => new NonproductionFilesystemStorage(join(tmpdir(), "unsupported"), {}, { fd: 0, path: tmpdir() }).store(Buffer.from("safe")), /requires Linux directory-descriptor traversal/); }
  finally { restore(); }
});

test("filesystem storage requires an absolute child root and pre-opened trusted parent", async () => {
  const restore = withStorageEnvironment();
  try {
    assert.throws(() => new NonproductionFilesystemStorage("relative"), /absolute path/);
    assert.throws(() => new NonproductionFilesystemStorage(resolve(tmpdir(), "root")), /pre-opened trusted/);
    assert.throws(() => new NonproductionFilesystemStorage(resolve(tmpdir(), "root"), {}, { fd: 0, path: resolve(tmpdir(), "root") }), /must be a child/);
  } finally { restore(); }
});

test("filesystem storage uses generated contained keys, removes exactly its file, and is production-forbidden", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-")); const root = join(sandbox, "root"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const storage = new NonproductionFilesystemStorage(root, {}, { fd: parent.fd, path: sandbox }); const stored = await storage.store(Buffer.from("safe"));
    assert.match(stored.key, /^[0-9a-f-]{36}\.csv$/); const target = resolve(root, stored.key); assert.ok(target.startsWith(`${resolve(root)}${sep}`)); assert.equal(await readFile(target, "utf8"), "safe");
    await stored.remove(); await assert.rejects(() => readFile(target)); process.env.APP_ENV = "production"; assert.throws(() => new NonproductionFilesystemStorage(root, {}, { fd: parent!.fd, path: sandbox }), /forbidden/);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("filesystem storage rejects final and intermediate symlink components", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-links-")); const outside = join(sandbox, "outside"); const rootLink = join(sandbox, "root-link"); const nested = join(sandbox, "nested"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    await mkdir(outside); await mkdir(nested); await symlink(outside, rootLink, "dir"); await symlink(outside, join(nested, "redirect"), "dir"); parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    await assert.rejects(() => new NonproductionFilesystemStorage(rootLink, {}, { fd: parent!.fd, path: sandbox }).store(Buffer.from("escape")), /symbolic links|ELOOP/i);
    await assert.rejects(() => new NonproductionFilesystemStorage(join(nested, "redirect", "child"), {}, { fd: parent!.fd, path: sandbox }).store(Buffer.from("escape")), /symbolic links|ELOOP/i);
    assert.deepEqual(await readdir(outside), []);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("initial root replacement cannot establish external trust and failed acquisition caches no identity", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-initial-root-race-")); const root = join(sandbox, "root"); const moved = join(sandbox, "moved-root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined; let replaced = false;
  try {
    await mkdir(outside); await writeFile(marker, "external"); const probe = join(outside, "writable-probe"); await writeFile(probe, "yes"); await rm(probe);
    parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const storage = new NonproductionFilesystemStorage(root, { beforeInitialRootTrust: async () => { if (replaced) return; replaced = true; await rename(root, moved); await symlink(outside, root, "dir"); assert.equal((await lstat(root)).isSymbolicLink(), true); } }, { fd: parent.fd, path: sandbox });
    await assert.rejects(() => storage.store(Buffer.from("secret")), /symbolic links|ELOOP/i); assert.equal(replaced, true); assert.deepEqual(await readdir(outside), ["marker.txt"]); assert.equal(await readFile(marker, "utf8"), "external");
    await rm(root); await rename(moved, root); const stored = await storage.store(Buffer.from("safe-after-failure")); assert.equal(await readFile(join(root, stored.key), "utf8"), "safe-after-failure"); await stored.remove();
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("initial ancestor replacement is detected with zero external effects", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-initial-ancestor-race-")); const ancestor = join(sandbox, "ancestor"); const moved = join(sandbox, "moved-ancestor"); const root = join(ancestor, "root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined; let replaced = false;
  try {
    await mkdir(root, { recursive: true }); await mkdir(outside); await writeFile(marker, "external"); parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const storage = new NonproductionFilesystemStorage(root, { beforeInitialRootTrust: async () => { await rename(ancestor, moved); await symlink(outside, ancestor, "dir"); assert.equal((await lstat(ancestor)).isSymbolicLink(), true); replaced = true; } }, { fd: parent.fd, path: sandbox });
    await assert.rejects(() => storage.store(Buffer.from("secret")), (error: unknown) => { assert.match(String(error), /symbolic links|ELOOP/i); return true; }); assert.equal(replaced, true); assert.equal((await lstat(ancestor)).isSymbolicLink(),true); assert.deepEqual(await readdir(outside), ["marker.txt"]); assert.deepEqual(await readdir(join(moved, "root")), []); assert.equal(await readFile(marker, "utf8"), "external");
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("repeated initial-root replacement stress never trusts or writes to external targets", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-initial-race-stress-")); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); const before = (await readdir("/proc/self/fd")).length;
    for (let index = 0; index < 20; index += 1) {
      const root = join(sandbox, `root-${index}`); const moved = join(sandbox, `moved-${index}`); const outside = join(sandbox, `outside-${index}`); await mkdir(outside); await writeFile(join(outside, "marker.txt"), "external");
      let replacementComplete=false; const storage = new NonproductionFilesystemStorage(root, { beforeInitialRootTrust: async () => { await rename(root, moved); await symlink(outside, root, "dir"); assert.equal((await lstat(root)).isSymbolicLink(),true); replacementComplete=true; } }, { fd: parent.fd, path: sandbox });
      await assert.rejects(() => storage.store(Buffer.from(`secret-${index}`)), (error: unknown) => { assert.match(String(error), /symbolic links|ELOOP/i); return true; }); assert.equal(replacementComplete,true); assert.equal((await lstat(root)).isSymbolicLink(),true); assert.deepEqual(await readdir(outside), ["marker.txt"]); assert.deepEqual(await readdir(moved), []);
    }
    const after = (await readdir("/proc/self/fd")).length; assert.ok(after <= before + 2, `race descriptor count grew from ${before} to ${after}`);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("trusted parent ownership and permissions fail closed", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-unsafe-parent-")); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    await chmod(sandbox, 0o777); parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    await assert.rejects(() => new NonproductionFilesystemStorage(join(sandbox, "root"), {}, { fd: parent!.fd, path: sandbox }).store(Buffer.from("safe")), /must not be group- or world-writable/);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("directory binding defeats deterministic root replacement during create with zero external writes", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-create-race-")); const root = join(sandbox, "root"); const moved = join(sandbox, "moved-root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    await mkdir(root); await mkdir(outside); await writeFile(marker, "external"); parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const storage = new NonproductionFilesystemStorage(root, { afterCreateVerification: async () => { await rename(root, moved); await symlink(outside, root, "dir"); } }, { fd: parent.fd, path: sandbox });
    await assert.rejects(() => storage.store(Buffer.from("secret-content")), /symbolic links|root changed|ELOOP/i); assert.deepEqual(await readdir(outside), ["marker.txt"]); assert.deepEqual(await readdir(moved), []);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("directory binding defeats deterministic root replacement during remove with zero external deletes", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-remove-race-")); const root = join(sandbox, "root"); const moved = join(sandbox, "moved-root"); const outside = join(sandbox, "outside"); const marker = join(outside, "marker.txt"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    await mkdir(root); await mkdir(outside); await writeFile(marker, "external"); parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    let replace = false; const storage = new NonproductionFilesystemStorage(root, { afterRemoveVerification: async () => { if (!replace) return; await rename(root, moved); await symlink(outside, root, "dir"); } }, { fd: parent.fd, path: sandbox });
    const stored = await storage.store(Buffer.from("safe")); replace = true; await assert.rejects(() => stored.remove(), /symbolic links|root changed|ELOOP/i); assert.equal(await readFile(marker, "utf8"), "external"); assert.equal(await readFile(join(moved, stored.key), "utf8"), "safe"); assert.deepEqual(await readdir(outside), ["marker.txt"]);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("filesystem removal refuses a redirected target and never deletes external content", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-remove-")); const root = join(sandbox, "root"); const external = join(sandbox, "external"); const marker = join(external, "marker.txt"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); const storage = new NonproductionFilesystemStorage(root, {}, { fd: parent.fd, path: sandbox }); const stored = await storage.store(Buffer.from("safe")); await mkdir(external); await writeFile(marker, "external"); await rm(join(root, stored.key)); await symlink(external, join(root, stored.key), "dir");
    await assert.rejects(() => stored.remove(), /symbolic links|not a regular file|ELOOP/i); assert.equal(await readFile(marker, "utf8"), "external");
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});

test("repeated store/remove closes all owned descriptors", linuxOnly, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "vtk-storage-fd-")); const root = join(sandbox, "root"); const restore = withStorageEnvironment(); let parent: FileHandle | undefined;
  try {
    parent = await open(sandbox, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); const storage = new NonproductionFilesystemStorage(root, {}, { fd: parent.fd, path: sandbox }); const before = (await readdir("/proc/self/fd")).length;
    for (let index = 0; index < 40; index += 1) { const stored = await storage.store(Buffer.from(`safe-${index}`)); await stored.remove(); }
    const after = (await readdir("/proc/self/fd")).length; assert.ok(after <= before + 2, `descriptor count grew from ${before} to ${after}`);
  } finally { await parent?.close(); restore(); await rm(sandbox, { recursive: true, force: true }); }
});
