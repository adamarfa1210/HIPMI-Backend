import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import * as authSchema from "./schema/auth.js";
import * as erpSchema from "./schema/erp.js";
import * as cmsSchema from "./schema/cms.js";

dotenv.config();

export const schema = {
  ...authSchema,
  ...erpSchema,
  ...cmsSchema,
};

export type AppSchema = typeof schema;

const isTest = process.env.NODE_ENV === "test";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/hipmi_db";

let rawClient: postgres.Sql | PGlite;
let dbInstance: any;

if (isTest && !process.env.TEST_DATABASE_URL) {
  const pgliteClient = new PGlite();
  rawClient = pgliteClient;
  dbInstance = drizzlePglite(pgliteClient, { schema });
} else if (!isTest && dbUrl.startsWith("pglite://")) {
  // Local file-backed PGlite persistence when Supabase / external Postgres is not yet configured
  const relDir = dbUrl.slice("pglite://".length) || "./.local-db";
  const dataDir = path.resolve(process.cwd(), relDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const pgliteClient = new PGlite(dataDir);
  rawClient = pgliteClient;
  dbInstance = drizzlePglite(pgliteClient, { schema });
} else {
  const rawTargetUrl = isTest && process.env.TEST_DATABASE_URL ? process.env.TEST_DATABASE_URL : dbUrl;
  // On Vercel Serverless, prefer Supabase Transaction Pooler (:6543) to avoid Session Pooler max_clients (15) exhaustion
  const targetUrl =
    process.env.VERCEL && rawTargetUrl.includes(".pooler.supabase.com:5432/")
      ? rawTargetUrl.replace(".pooler.supabase.com:5432/", ".pooler.supabase.com:6543/")
      : rawTargetUrl;
  const usesTxPooler = targetUrl.includes(":6543/");
  const pgClient = postgres(targetUrl, {
    max: usesTxPooler ? 10 : (process.env.VERCEL ? 1 : 10),
    idle_timeout: 20,
    connect_timeout: 10,
    ...(usesTxPooler ? { prepare: false } : {}),
  });
  rawClient = pgClient;
  dbInstance = drizzlePg(pgClient, { schema });
}

// Proxy wrapper so if tests replace db with an in-memory instance, existing imports continue working
let currentDb = dbInstance;
let currentClient = rawClient;

export const db: ReturnType<typeof drizzlePg<AppSchema>> = new Proxy({} as any, {
  get(_target, prop) {
    return (currentDb as any)[prop];
  },
});

export const client = new Proxy({} as any, {
  get(_target, prop) {
    return (currentClient as any)[prop];
  },
});

export function setTestDb(newDb: any, newClient?: any) {
  currentDb = newDb;
  if (newClient) {
    currentClient = newClient;
  }
}

export async function closeDbConnection(): Promise<void> {
  if (currentClient instanceof PGlite) {
    await currentClient.close();
  } else if (typeof (currentClient as any)?.end === "function") {
    await (currentClient as postgres.Sql).end();
  }
}
