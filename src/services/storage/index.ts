import type { StorageAdapter } from "./storage.adapter.js";
import { S3StorageAdapter } from "./s3.storage.js";
import { LocalStorageAdapter } from "./local.storage.js";

export * from "./storage.adapter.js";
export * from "./s3.storage.js";
export * from "./local.storage.js";

let defaultAdapter: StorageAdapter | null = null;

export function getStorageAdapter(driver = process.env.STORAGE_DRIVER): StorageAdapter {
  if (defaultAdapter) {
    return defaultAdapter;
  }

  const normalizedDriver = (driver || "local").toLowerCase();
  if (normalizedDriver === "s3" || normalizedDriver === "supabase") {
    defaultAdapter = new S3StorageAdapter();
  } else {
    defaultAdapter = new LocalStorageAdapter();
  }

  return defaultAdapter;
}

export function setStorageAdapter(adapter: StorageAdapter): void {
  defaultAdapter = adapter;
}
