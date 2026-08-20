import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, parse, resolve, sep } from "node:path";

export interface StoredFile { key: string; remove(): Promise<void>; }
export interface FileStorage { store(content: Buffer): Promise<StoredFile>; }

interface FilesystemStorageTestHooks {
  afterCreateVerification?: () => Promise<void>;
  afterRemoveVerification?: () => Promise<void>;
}

interface BoundRoot { canonicalRoot: string; handle: FileHandle; path: string; }

export class NonproductionFilesystemStorage implements FileStorage {
  private readonly root: string;
  private canonicalRoot: string | null = null;
  private readonly testHooks: FilesystemStorageTestHooks;

  constructor(root = process.env.STAGING_FILE_ROOT, testHooks: FilesystemStorageTestHooks = {}) {
    if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") throw new Error("The nonproduction filesystem storage adapter is forbidden in production.");
    if (process.env.ALLOW_NONPRODUCTION_STORAGE !== "true") throw new Error("ALLOW_NONPRODUCTION_STORAGE=true is required for filesystem storage.");
    if (!root) throw new Error("STAGING_FILE_ROOT is required for nonproduction filesystem storage.");
    if (Object.keys(testHooks).length && process.env.NODE_ENV !== "test") throw new Error("Filesystem storage race hooks are test-only.");
    this.root = resolve(root);
    this.testHooks = testHooks;
  }

  private async rejectLinkedComponents(path: string) {
    const components: string[] = [];
    let current = path;
    const anchor = parse(path).root;
    while (current !== anchor) { components.push(current); current = dirname(current); }
    for (const component of components.reverse()) {
      try {
        const status = await lstat(component);
        if (status.isSymbolicLink()) throw new Error(`Filesystem storage path contains a symbolic link or reparse-point redirect: ${component}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  private async ensureCanonicalRoot() {
    if (process.platform !== "linux") throw new Error("Safe nonproduction filesystem storage requires Linux directory-descriptor binding; this platform is unsupported.");
    await this.rejectLinkedComponents(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.rejectLinkedComponents(this.root);
    const canonical = await realpath(this.root);
    if (this.canonicalRoot && this.canonicalRoot !== canonical) throw new Error("Filesystem storage root changed after initialization.");
    this.canonicalRoot = canonical;
    return canonical;
  }

  private async bindRoot(): Promise<BoundRoot> {
    const canonicalRoot = await this.ensureCanonicalRoot();
    const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
    const handle = await open(canonicalRoot, flags);
    try {
      if (!(await handle.stat()).isDirectory()) throw new Error("Filesystem storage root is not a directory.");
      const path = `/proc/self/fd/${handle.fd}`;
      if (await realpath(path) !== canonicalRoot) throw new Error("Filesystem storage directory binding did not match its canonical root.");
      return { canonicalRoot, handle, path };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  private async rootStillBound(bound: BoundRoot) {
    let current: string;
    try { current = await realpath(this.root); } catch { throw new Error("Filesystem storage root changed at the operation boundary."); }
    if (current !== bound.canonicalRoot || await realpath(bound.path) !== bound.canonicalRoot) throw new Error("Filesystem storage root changed at the operation boundary.");
  }

  async store(content: Buffer): Promise<StoredFile> {
    const bound = await this.bindRoot();
    const key = `${randomUUID()}.csv`;
    const target = `${bound.path}${sep}${key}`;
    try {
      await this.testHooks.afterCreateVerification?.();
      await this.rootStillBound(bound);
      const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(content); } finally { await handle.close(); }
      try { await this.rootStillBound(bound); } catch (error) { await unlink(target).catch(() => undefined); throw error; }
    } finally {
      await bound.handle.close();
    }
    return { key, remove: async () => {
      const removal = await this.bindRoot();
      const removalTarget = `${removal.path}${sep}${key}`;
      let targetHandle: FileHandle | null = null;
      try {
        try { targetHandle = await open(removalTarget, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
        if (!(await targetHandle.stat()).isFile()) throw new Error("Stored file removal target is not a regular file.");
        await this.testHooks.afterRemoveVerification?.();
        await this.rootStillBound(removal);
        await unlink(removalTarget);
      } finally {
        await targetHandle?.close();
        await removal.handle.close();
      }
    } };
  }
}
