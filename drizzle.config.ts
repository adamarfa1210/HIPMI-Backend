import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: [
    "./dist/src/db/schema/auth.js",
    "./dist/src/db/schema/erp.js",
    "./dist/src/db/schema/cms.js",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/hipmi_db",
  },
  verbose: true,
  strict: true,
});
