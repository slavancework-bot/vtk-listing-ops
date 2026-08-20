import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, parse, resolve, sep } from "node:path";

export interface StoredFile { key: string; remove(): Promise<void>; }
export interface FileStorage { store(content: Buffer): Promise<StoredFile>; }

export class NonproductionFilesystemStorage implements FileStorage {
  private readonly root: string;
  private canonicalRoot: string | null = null;
  constructor(root = process.env.STAGING_FILE_ROOT) {
    if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") throw new Error("The nonproduction filesystem storage adapter is forbidden in production.");
    if (process.env.ALLOW_NONPRODUCTION_STORAGE !== "true") throw new Error("ALLOW_NONPRODUCTION_STORAGE=true is required for filesystem storage.");
    if (!root) throw new Error("STAGING_FILE_ROOT is required for nonproduction filesystem storage.");
    this.root = resolve(root);
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
    await this.rejectLinkedComponents(this.root);
    await mkdir(this.root, { recursive: true });
    await this.rejectLinkedComponents(this.root);
    const canonical = await realpath(this.root);
    if (this.canonicalRoot && this.canonicalRoot !== canonical) throw new Error("Filesystem storage root changed after initialization.");
    this.canonicalRoot = canonical;
    return canonical;
  }

  private inside(root: string, target: string) { return target.startsWith(`${root}${sep}`); }

  async store(content: Buffer): Promise<StoredFile> {
    const canonicalRoot = await this.ensureCanonicalRoot();
    const key = `${randomUUID()}.csv`; const target = resolve(canonicalRoot, key);
    if (!this.inside(canonicalRoot,target)) throw new Error("Generated storage path escaped its configured root.");
    const handle = await open(target, "wx");
    try { await handle.writeFile(content); } finally { await handle.close(); }
    const canonicalTarget = await realpath(target);
    const currentRoot = await this.ensureCanonicalRoot();
    if (currentRoot !== canonicalRoot || !this.inside(canonicalRoot,canonicalTarget)) {
      await unlink(canonicalTarget).catch(() => undefined);
      throw new Error("Stored file escaped its configured canonical root.");
    }
    return { key, remove: async () => {
      const verifiedRoot = await this.ensureCanonicalRoot();
      if (verifiedRoot !== canonicalRoot) throw new Error("Filesystem storage root changed before removal.");
      let verifiedTarget: string;
      try { verifiedTarget = await realpath(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      if (!this.inside(canonicalRoot,verifiedTarget)) throw new Error("Stored file removal escaped its configured canonical root.");
      await unlink(verifiedTarget);
    } };
  }
}
