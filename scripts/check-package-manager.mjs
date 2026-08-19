import { existsSync, rmSync } from "node:fs";

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  if (existsSync(lockfile)) rmSync(lockfile);
}

if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead.");
  process.exit(1);
}
