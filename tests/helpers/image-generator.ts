import zlib from 'node:zlib';

export interface ImageDimension {
  width: number;
  height: number;
}

export const CMS_IMAGE_PRESETS = {
  heroSlide: { width: 1280, height: 720, minWidth: 1280, minHeight: 720, ratio: '16:9' },
  partner: { width: 512, height: 512, minWidth: 512, minHeight: 512, ratio: '1:1' },
  proker: { width: 540, height: 675, minWidth: 540, minHeight: 675, ratio: '4:5' },
  tentang: { width: 800, height: 600, minWidth: 800, minHeight: 600, ratio: '4:3' },
  avatar: { width: 400, height: 400, minWidth: 400, minHeight: 400, ratio: '1:1' },
} as const;

// CRC32 table calculation for PNG chunks
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);

  const crcVal = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

/**
 * Creates a valid, well-formed PNG image buffer of the requested width and height.
 */
export function createPng(
  width: number,
  height: number,
  options?: { colorType?: number; fillByte?: number }
): Buffer {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: width (4), height (4), bit depth (1), color type (1), compression (1), filter (1), interlace (1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  const colorType = options?.colorType ?? 0; // 0 = grayscale (1 byte/pixel)
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace none

  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  // Minimal raw raster data: each scanline starts with filter byte 0, followed by width bytes
  const bytesPerPixel = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const scanlineWidth = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(scanlineWidth * height, options?.fillByte ?? 0x80);
  for (let y = 0; y < height; y++) {
    rawData[y * scanlineWidth] = 0; // Filter type 0 (None)
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makePngChunk('IDAT', compressedData);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates a valid, well-formed JPEG image buffer of the requested width and height,
 * with an optional mock EXIF APP1 segment.
 */
export function createJpeg(
  width: number,
  height: number,
  options?: { withExif?: boolean; exifComment?: string }
): Buffer {
  const chunks: Buffer[] = [];

  // SOI (Start of Image)
  chunks.push(Buffer.from([0xff, 0xd8]));

  // APP0 (JFIF standard header)
  const jfifData = Buffer.from([
    0xff, 0xe0,
    0x00, 0x10, // length = 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // 'JFIF\0'
    0x01, 0x01, // v1.1
    0x00,       // aspect ratio units
    0x00, 0x48, // Xdensity = 72
    0x00, 0x48, // Ydensity = 72
    0x00, 0x00, // thumbnail 0x0
  ]);
  chunks.push(jfifData);

  // Optional APP1 (EXIF) segment
  if (options?.withExif) {
    const comment = options.exifComment || 'HIPMI-PT-TELKOM-EXIF-DATA';
    const commentBuf = Buffer.from(comment, 'utf8');
    // Minimal valid EXIF APP1
    // Header: FF E1 [length] "Exif\0\0" [TIFF header: "II*\0" + offset]
    const exifPayload = Buffer.concat([
      Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), // "Exif\0\0"
      Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]), // Little-endian TIFF header
      Buffer.from([0x01, 0x00]), // 1 IFD tag entry
      // Tag 0x010E (ImageDescription), type ASCII (2), count, offset
      Buffer.from([0x0e, 0x01, 0x02, 0x00]),
      Buffer.from([commentBuf.length, 0x00, 0x00, 0x00]),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]), // offset to comment
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // next IFD offset 0
      commentBuf,
    ]);

    const app1Header = Buffer.alloc(4);
    app1Header[0] = 0xff;
    app1Header[1] = 0xe1;
    app1Header.writeUInt16BE(exifPayload.length + 2, 2);

    chunks.push(app1Header);
    chunks.push(exifPayload);
  }

  // DQT (Define Quantization Table)
  const dqt = Buffer.alloc(69);
  dqt[0] = 0xff;
  dqt[1] = 0xdb;
  dqt.writeUInt16BE(67, 2);
  dqt[4] = 0x00; // table 0, 8-bit precision
  dqt.fill(16, 5); // 64 entries filled with 16
  chunks.push(dqt);

  // SOF0 (Start of Frame 0 - Baseline DCT)
  // [FF C0] [length: 11] [precision: 8] [height: 2] [width: 2] [components: 1] [id: 1, samp: 17, qtable: 0]
  const sof0 = Buffer.alloc(13);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(11, 2);
  sof0[4] = 0x08; // 8-bit precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 0x01; // 1 component (grayscale)
  sof0[10] = 0x01; // Component ID 1
  sof0[11] = 0x11; // 1x1 sampling factor
  sof0[12] = 0x00; // Quantization table index 0
  chunks.push(sof0);

  // DHT (Define Huffman Table)
  const dht = Buffer.from([
    0xff, 0xc4,
    0x00, 0x1f, // length = 31
    0x00,       // DC table 0
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
  ]);
  chunks.push(dht);

  // SOS (Start of Scan)
  const sos = Buffer.from([
    0xff, 0xda,
    0x00, 0x08, // length = 8
    0x01,       // 1 component
    0x01, 0x00, // component 1 uses DC table 0
    0x00, 0x3f, 0x00, // spectral selection
  ]);
  chunks.push(sos);

  // Compressed scan data (dummy DC byte followed by EOI)
  chunks.push(Buffer.from([0x00]));

  // EOI (End of Image)
  chunks.push(Buffer.from([0xff, 0xd9]));

  return Buffer.concat(chunks);
}

/**
 * Creates an image buffer in the specified format with requested dimensions.
 */
export function createImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' = 'png',
  options?: { withExif?: boolean; exifComment?: string }
): Buffer {
  if (format === 'jpeg') {
    return createJpeg(width, height, options);
  }
  return createPng(width, height);
}

/**
 * Generates an oversized image buffer exceeding targetSizeMB (e.g. 5.1 MB)
 * to test size limit rejection (max 5 MB).
 */
export function createOversizedBuffer(
  targetSizeMB: number = 5.2,
  format: 'png' | 'jpeg' = 'png'
): Buffer {
  const baseImg = createImage(1280, 720, format);
  const targetBytes = Math.ceil(targetSizeMB * 1024 * 1024);
  const paddingNeeded = Math.max(0, targetBytes - baseImg.length);

  if (paddingNeeded === 0) return baseImg;

  if (format === 'png') {
    // Append a custom auxiliary chunk (e.g. 'pADd') before the IEND chunk
    const padData = Buffer.alloc(paddingNeeded - 12);
    const padChunk = makePngChunk('pADd', padData);
    // Insert padChunk before IEND (last 12 bytes)
    const beforeIend = baseImg.subarray(0, baseImg.length - 12);
    const iend = baseImg.subarray(baseImg.length - 12);
    return Buffer.concat([beforeIend, padChunk, iend]);
  } else {
    // For JPEG, insert an APP2 or COM comment marker with padding
    const padData = Buffer.alloc(paddingNeeded);
    return Buffer.concat([baseImg, padData]);
  }
}

/**
 * Creates an intentionally corrupted / non-image buffer.
 */
export function createCorruptedBuffer(size: number = 256): Buffer {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buf[i] = (i * 37) % 256;
  }
  return buf;
}

/**
 * Inspects a PNG or JPEG buffer and extracts width and height from the header.
 */
export function extractDimensions(
  buffer: Buffer
): { width: number; height: number; format: 'png' | 'jpeg' | 'unknown' } {
  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, format: 'png' };
  }

  // Check JPEG: FF D8
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height, format: 'jpeg' };
      }
      const segmentLen = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLen;
    }
  }

  return { width: 0, height: 0, format: 'unknown' };
}

/**
 * Checks if a buffer contains an EXIF APP1 marker (FF E1 ... Exif\0\0).
 */
export function hasExif(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] === 0xff && buffer[offset + 1] === 0xe1) {
      const id = buffer.subarray(offset + 4, offset + 10).toString('ascii');
      if (id.startsWith('Exif')) {
        return true;
      }
    }
    if (buffer[offset] === 0xff) {
      const segLen = buffer.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    } else {
      offset++;
    }
  }
  return false;
}
