export interface UploadOptions {
  buffer?: Buffer;
  body?: Buffer;
  key: string;
  contentType: string;
  isPublic?: boolean;
}

export interface UploadResult {
  key: string;
  url: string;
  size?: number;
  contentType?: string;
  width?: number;
  height?: number;
}

export interface StorageAdapter {
  upload(
    keyOrOptions: string | UploadOptions,
    body?: Buffer,
    contentType?: string
  ): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
