import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";

export interface StoredFile { key: string; remove(): Promise<void>; }
export interface FileStorage { store(content: Buffer): Promise<StoredFile>; }

export class NonproductionFilesystemStorage implements FileStorage {
  private readonly root: string;
  constructor(root = process.env.STAGING_FILE_ROOT) {
    if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") throw new Error("The nonproduction filesystem storage adapter is forbidden in production.");
    if (process.env.ALLOW_NONPRODUCTION_STORAGE !== "true") throw new Error("ALLOW_NONPRODUCTION_STORAGE=true is required for filesystem storage.");
    if (!root) throw new Error("STAGING_FILE_ROOT is required for nonproduction filesystem storage.");
    this.root = resolve(root);
  }
  async store(content: Buffer): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.csv`; const target = resolve(this.root, key);
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error("Generated storage path escaped its configured root.");
    await writeFile(target, content, { flag: "wx" });
    return { key, remove: async () => { await unlink(target).catch(() => undefined); } };
  }
}
