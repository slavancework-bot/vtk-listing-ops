import { logger } from "./lib/logger";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";

if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
  throw new Error("A production IdentityProvider adapter must be configured before deployment; the development identity adapter is forbidden.");
}
if (process.env.APP_ENV !== "staging" && process.env.APP_ENV !== "development") throw new Error("APP_ENV must explicitly be staging or development.");
if(process.env.APP_ENV==="staging"&&(process.env.ALLOW_NONPRODUCTION_DATABASE!=="true"||!/(test|staging|nonprod)/i.test(process.env.DATABASE_URL??"")))throw new Error("Staging requires an explicitly allowed database URL whose database name identifies it as test, staging, or nonproduction.");

let trustedStorageParent: FileHandle | undefined;
if (process.env.APP_ENV === "staging" && process.env.ALLOW_NONPRODUCTION_STORAGE === "true") {
  const parentPath = process.env.STAGING_TRUSTED_PARENT_PATH;
  if (!parentPath || !isAbsolute(parentPath)) throw new Error("Staging filesystem storage requires an absolute STAGING_TRUSTED_PARENT_PATH prepared by the trusted launcher.");
  trustedStorageParent = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  process.env.STAGING_TRUSTED_PARENT_FD = String(trustedStorageParent.fd);
}

const { default: app } = await import("./app");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
