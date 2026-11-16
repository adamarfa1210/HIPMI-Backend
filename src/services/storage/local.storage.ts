import fs from "fs/promises";
import path from "path";
import type { StorageAdapter, UploadOptions, UploadResult } from "./storage.adapter.js";

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private baseUrl: string;

  constructor(options?: { baseDir?: string; baseUrl?: string }) {
    this.baseDir =
      options?.baseDir ||
      process.env.LOCAL_STORAGE_DIR ||
      path.resolve(process.cwd(), "uploads");
    this.baseUrl =
      options?.baseUrl ||
      process.env.LOCAL_STORAGE_BASE_URL ||
      "http://localhost:3000/uploads";
  }

  async upload(
    keyOrOptions: string | UploadOptions,
    body?: Buffer,
    contentType?: string
  ): Promise<UploadResult> {
    let key: string;
    let fileBuffer: Buffer;
    let fileContentType: string;

    if (typeof keyOrOptions === "string") {
      key = keyOrOptions;
      fileBuffer = body!;
      fileContentType = contentType || "application/octet-stream";
    } else {
      key = keyOrOptions.key;
      fileBuffer = keyOrOptions.buffer || keyOrOptions.body!;
      fileContentType = keyOrOptions.contentType || "application/octet-stream";
    }

    const cleanKey = key.replace(/^[/\\]+/, "");
    const filePath = path.join(this.baseDir, cleanKey);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    const url = this.getUrl(cleanKey);
    return {
      key: cleanKey,
      url,
      size: fileBuffer.length,
      contentType: fileContentType,
    };
  }

  async delete(key: string): Promise<void> {
    const cleanKey = key.replace(/^[/\\]+/, "");
    const filePath = path.join(this.baseDir, cleanKey);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    return `${this.baseUrl.replace(/\/$/, "")}/${cleanKey}`;
  }
}
