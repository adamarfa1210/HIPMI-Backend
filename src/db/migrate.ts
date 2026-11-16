import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { db, closeDbConnection } from "./index.js";
import dotenv from "dotenv";

dotenv.config();

export async function runMigrations() {
  console.log("Applying database migrations from ./drizzle...");
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.startsWith("pglite://")) {
    await migratePglite(db as any, { migrationsFolder: "./drizzle" });
  } else {
    await migratePg(db as any, { migrationsFolder: "./drizzle" });
  }
  console.log("Migrations applied successfully.");
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => closeDbConnection())
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
