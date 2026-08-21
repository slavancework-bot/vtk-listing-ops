import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
const migrationsFolder=fileURLToPath(new URL("../../../lib/db/drizzle",import.meta.url));
await migrate(db,{migrationsFolder});await pool.end();
