import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is required.");

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
const sql = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10 });

try {
  for (const file of migrationFiles) {
    const contents = await readFile(join(migrationsDir, file), "utf8");
    await sql.unsafe(contents);
    console.info(`Applied ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
