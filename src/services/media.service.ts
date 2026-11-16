import sharp, { type Metadata } from "sharp";
import { AppError } from "../middlewares/error.middleware.js";
import { getStorageAdapter } from "./storage/index.js";

export interface SlotConstraint {
  minWidth: number;
  minHeight: number;
  portrait?: boolean;
  aspectRatio?: string;
}

export const SLOT_CONSTRAINTS: Record<string, SlotConstraint> = {
  // Canonical slots
  "hero-home": { minWidth: 1280, minHeight: 720, aspectRatio: "16:9" },
  "video-poster": { minWidth: 1280, minHeight: 720, aspectRatio: "16:9" },
  "masthead-banner": { minWidth: 1200, minHeight: 675 },
  "bidang-tile": { minWidth: 640, minHeight: 800, portrait: true, aspectRatio: "4:5" },
  "partner-logo": { minWidth: 512, minHeight: 512, aspectRatio: "1:1" },
  "kader-business": { minWidth: 600, minHeight: 600 },
  achievement: { minWidth: 600, minHeight: 600 },
  "program-poster": { minWidth: 540, minHeight: 675, portrait: true, aspectRatio: "4:5" },

  // Aliases for compatibility
  heroSlide: { minWidth: 1280, minHeight: 720, aspectRatio: "16:9" },
  hero: { minWidth: 1280, minHeight: 720, aspectRatio: "16:9" },
  partner: { minWidth: 512, minHeight: 512, aspectRatio: "1:1" },
  proker: { minWidth: 540, minHeight: 675, portrait: true, aspectRatio: "4:5" },
  tentang: { minWidth: 800, minHeight: 600, aspectRatio: "4:3" },
  bisnis: { minWidth: 600, minHeight: 600 },
  prestasi: { minWidth: 600, minHeight: 600 },
  avatar: { minWidth: 400, minHeight: 400, aspectRatio: "1:1" },
};

export interface ProcessMediaOptions {
  buffer: Buffer;
  contentType: string;
  slot: string;
  filename?: string;
  imageAlt?: string;
}

export interface ProcessMediaResult {
  url: string;
  key: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  slotStatus: "ready";
  imageAlt?: string;
}

export class MediaService {
  private static readonly MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  private static readonly ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  private static readonly ALLOWED_FORMATS = ["jpeg", "png", "webp"];

  static async processImage(options: ProcessMediaOptions): Promise<ProcessMediaResult> {
    const { buffer, contentType, slot, filename, imageAlt } = options;

    // 1. Buffer length check
    if (!buffer || buffer.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "File gambar kosong (0 byte)");
    }

    if (buffer.length > this.MAX_SIZE_BYTES) {
      throw new AppError(
        413,
        "PAYLOAD_TOO_LARGE",
        `Ukuran file (${buffer.length} byte) melebihi batas maksimal 5 MB`
      );
    }

    // 2. MIME type check
    if (contentType && !this.ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Format file ${contentType} tidak didukung. Gunakan JPEG, PNG, atau WebP`
      );
    }

    // 3. Metadata inspection with Sharp
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new AppError(400, "BAD_REQUEST", "Format file tidak valid atau data gambar rusak");
    }

    if (!metadata.format || !this.ALLOWED_FORMATS.includes(metadata.format)) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Format ${metadata.format?.toUpperCase() || "UNKNOWN"} tidak diizinkan. Hanya JPEG, PNG, dan WebP`
      );
    }

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // 4. Constraint lookup
    const constraint = SLOT_CONSTRAINTS[slot] || SLOT_CONSTRAINTS["hero-home"];

    // 5. Dimension check
    if (width < constraint.minWidth || height < constraint.minHeight) {
      throw new AppError(
        422,
        "UNPROCESSABLE_ENTITY",
        `Dimensi gambar (${width}x${height}px) di bawah resolusi minimum yang disyaratkan (${constraint.minWidth}x${constraint.minHeight}px)`
      );
    }

    // 6. Orientation check (portrait check for proker/program-poster)
    if (constraint.portrait && width > height) {
      throw new AppError(
        422,
        "UNPROCESSABLE_ENTITY",
        "Poster program kerja wajib berorientasi Portrait (tinggi > lebar)"
      );
    }

    // 7. Sharp transformation: strip EXIF & convert to WebP quality 84
    const transformedBuffer = await (sharp(buffer) as any)
      .withMetadata(false) // Strips EXIF metadata
      .webp({ quality: 84 })
      .toBuffer();

    const transformedMeta = await sharp(transformedBuffer).metadata();
    const finalWidth = transformedMeta.width || width;
    const finalHeight = transformedMeta.height || height;

    // 8. Generate storage key
    const timestamp = Date.now();
    const safeBase = filename
      ? filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")
      : "media";
    const storageKey = `cms/${slot}/${timestamp}_${safeBase}.webp`;

    // 9. Upload via StorageAdapter
    const storage = getStorageAdapter();
    const uploadResult = await storage.upload({
      key: storageKey,
      buffer: transformedBuffer,
      contentType: "image/webp",
      isPublic: true,
    });

    return {
      url: uploadResult.url,
      key: storageKey,
      width: finalWidth,
      height: finalHeight,
      format: "webp",
      sizeBytes: transformedBuffer.length,
      slotStatus: "ready",
      imageAlt: imageAlt || undefined,
    };
  }
}
