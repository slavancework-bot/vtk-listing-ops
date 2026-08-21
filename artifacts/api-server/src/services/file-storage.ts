import { constants, fstat as callbackFstat } from "node:fs";
import { mkdir, open, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

export interface StoredFile { key: string; remove(): Promise<void>; }
export interface FileStorage { store(content: Buffer): Promise<StoredFile>; }

interface FilesystemStorageTestHooks {
  beforeInitialRootTrust?: () => Promise<void>;
  afterCreateVerification?: () => Promise<void>;
  afterRemoveVerification?: () => Promise<void>;
}

export interface TrustedFilesystemParent { fd: number; path: string; }
interface DirectoryIdentity { dev: bigint; ino: bigint; }
interface BoundRoot { handle: FileHandle; identity: DirectoryIdentity; path: string; }

const fstat = promisify(callbackFstat);
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity) { return left.dev === right.dev && left.ino === right.ino; }
function identityOf(status: { dev: number | bigint; ino: number | bigint }): DirectoryIdentity { return { dev: BigInt(status.dev), ino: BigInt(status.ino) }; }

function environmentParent(): TrustedFilesystemParent | undefined {
  const fdText = process.env.STAGING_TRUSTED_PARENT_FD;
  const path = process.env.STAGING_TRUSTED_PARENT_PATH;
  if (!fdText && !path) return undefined;
  if (!fdText || !path || !/^\d+$/.test(fdText)) throw new Error("STAGING_TRUSTED_PARENT_FD and absolute STAGING_TRUSTED_PARENT_PATH are both required.");
  return { fd: Number(fdText), path };
}

export class NonproductionFilesystemStorage implements FileStorage {
  private readonly components: string[];
  private readonly parent: TrustedFilesystemParent;
  private trustedIdentity: DirectoryIdentity | null = null;
  private readonly testHooks: FilesystemStorageTestHooks;

  constructor(root = process.env.STAGING_FILE_ROOT, testHooks: FilesystemStorageTestHooks = {}, parent = environmentParent()) {
    if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") throw new Error("The nonproduction filesystem storage adapter is forbidden in production.");
    if (process.env.ALLOW_NONPRODUCTION_STORAGE !== "true") throw new Error("ALLOW_NONPRODUCTION_STORAGE=true is required for filesystem storage.");
    if (!root || !isAbsolute(root)) throw new Error("STAGING_FILE_ROOT must be an absolute path.");
    if (!parent || !Number.isSafeInteger(parent.fd) || parent.fd < 0 || !isAbsolute(parent.path)) throw new Error("A pre-opened trusted application-owned parent descriptor and absolute path are required.");
    if (Object.keys(testHooks).length && process.env.NODE_ENV !== "test") throw new Error("Filesystem storage race hooks are test-only.");
    const absoluteRoot = resolve(root);
    const trustedPath = resolve(parent.path);
    const child = relative(trustedPath, absoluteRoot);
    if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error("STAGING_FILE_ROOT must be a child of STAGING_TRUSTED_PARENT_PATH.");
    this.components = child.split(sep).filter(Boolean);
    this.parent = { fd: parent.fd, path: trustedPath };
    this.testHooks = testHooks;
  }

  private assertTrustedDirectory(status: Awaited<ReturnType<FileHandle["stat"]>>, label: string) {
    if (!status.isDirectory()) throw new Error(`${label} is not a directory.`);
    const uid = process.getuid?.();
    if (uid !== undefined && Number(status.uid) !== uid) throw new Error(`${label} is not owned by the application user.`);
    if ((Number(status.mode) & 0o022) !== 0) throw new Error(`${label} must not be group- or world-writable.`);
  }

  private async duplicateTrustedParent(): Promise<FileHandle> {
    if (process.platform !== "linux") throw new Error("Safe nonproduction filesystem storage requires Linux directory-descriptor traversal; this platform is unsupported.");
    const before = await fstat(this.parent.fd, { bigint: true });
    const duplicate = await open(`/proc/self/fd/${this.parent.fd}`, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      const duplicateStatus = await duplicate.stat({ bigint: true });
      const after = await fstat(this.parent.fd, { bigint: true });
      this.assertTrustedDirectory(duplicateStatus, "Trusted filesystem parent");
      if (!sameIdentity(identityOf(before), identityOf(duplicateStatus)) || !sameIdentity(identityOf(before), identityOf(after))) throw new Error("Trusted filesystem parent descriptor changed during duplication.");
      return duplicate;
    } catch (error) { await duplicate.close(); throw error; }
  }

  private async traverseRoot(create: boolean, runInitialHook: boolean): Promise<BoundRoot> {
    let current = await this.duplicateTrustedParent();
    try {
      for (let index = 0; index < this.components.length; index += 1) {
        const component = this.components[index]!;
        const childPath = `/proc/self/fd/${current.fd}/${component}`;
        if (create) {
          try { await mkdir(childPath, { mode: 0o700 }); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        }
        if (runInitialHook && index === this.components.length - 1) await this.testHooks.beforeInitialRootTrust?.();
        let child: FileHandle;
        try { child = await open(childPath, directoryFlags); }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ELOOP" || code === "ENOTDIR") throw new Error(`Filesystem storage traversal refused symbolic links or a non-directory component: ${component}`);
          throw error;
        }
        try { this.assertTrustedDirectory(await child.stat({ bigint: true }), `Filesystem storage component ${component}`); }
        catch (error) { await child.close(); throw error; }
        await current.close();
        current = child;
      }
      const status = await current.stat({ bigint: true });
      return { handle: current, identity: identityOf(status), path: `/proc/self/fd/${current.fd}` };
    } catch (error) { await current.close(); throw error; }
  }

  private async bindRoot(): Promise<BoundRoot> {
    const initial = this.trustedIdentity === null;
    const bound = await this.traverseRoot(true, initial);
    try {
      if (this.trustedIdentity && !sameIdentity(this.trustedIdentity, bound.identity)) throw new Error("Filesystem storage root changed after initialization.");
      const verification = await this.traverseRoot(false, false);
      try { if (!sameIdentity(bound.identity, verification.identity)) throw new Error("Filesystem storage root changed during initial descriptor acquisition."); }
      finally { await verification.handle.close(); }
      if (initial) this.trustedIdentity = bound.identity;
      return bound;
    } catch (error) { await bound.handle.close(); throw error; }
  }

  private async rootStillBound(bound: BoundRoot) {
    const current = await this.traverseRoot(false, false);
    try {
      if (!sameIdentity(bound.identity, current.identity) || !this.trustedIdentity || !sameIdentity(bound.identity, this.trustedIdentity)) throw new Error("Filesystem storage root changed at the operation boundary.");
    } finally { await current.handle.close(); }
  }

  async store(content: Buffer): Promise<StoredFile> {
    const bound = await this.bindRoot();
    const key = `${randomUUID()}.csv`;
    const target = `${bound.path}/${key}`;
    try {
      await this.testHooks.afterCreateVerification?.();
      await this.rootStillBound(bound);
      const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(content); } finally { await handle.close(); }
      try { await this.rootStillBound(bound); } catch (error) { await unlink(target).catch(() => undefined); throw error; }
    } finally { await bound.handle.close(); }
    return { key, remove: async () => {
      const removal = await this.bindRoot();
      const removalTarget = `${removal.path}/${key}`;
      let targetHandle: FileHandle | null = null;
      try {
        try { targetHandle = await open(removalTarget, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
        if (!(await targetHandle.stat()).isFile()) throw new Error("Stored file removal target is not a regular file.");
        await this.testHooks.afterRemoveVerification?.();
        await this.rootStillBound(removal);
        await unlink(removalTarget);
      } finally { await targetHandle?.close(); await removal.handle.close(); }
    } };
  }
}
