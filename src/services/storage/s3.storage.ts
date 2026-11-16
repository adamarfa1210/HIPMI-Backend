import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter, UploadOptions, UploadResult } from "./storage.adapter.js";

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private endpoint?: string;
  private publicBaseUrl: string;

  constructor(options?: {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
  }) {
    const endpoint = options?.endpoint || process.env.S3_ENDPOINT;
    const region = options?.region || process.env.S3_REGION || "ap-southeast-1";
    const bucket = options?.bucket || process.env.S3_BUCKET || "hipmi-assets";
    const accessKeyId = options?.accessKeyId || process.env.S3_ACCESS_KEY_ID || "";
    const secretAccessKey = options?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || "";

    this.bucket = bucket;
    this.endpoint = endpoint;
    this.publicBaseUrl =
      options?.publicBaseUrl ||
      process.env.S3_PUBLIC_BASE_URL ||
      (endpoint ? `${endpoint.replace(/\/$/, "")}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`);

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
      forcePathStyle: true,
    });
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

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: fileContentType,
    });

    await this.client.send(command);

    const url = this.getUrl(key);
    return {
      key,
      url,
      size: fileBuffer.length,
      contentType: fileContentType,
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  getUrl(key: string): string {
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${cleanKey}`;
  }
}
