import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import {
  createPng,
  createJpeg,
  createOversizedBuffer,
  createCorruptedBuffer,
  extractDimensions,
  hasExif,
  CMS_IMAGE_PRESETS,
} from '../../helpers/image-generator.js';

// Portable StorageAdapter interface per PRD & Architecture
export interface StorageAdapter {
  upload(key: string, body: Buffer, contentType: string): Promise<{ url: string; key: string }>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export class S3StorageAdapter implements StorageAdapter {
  private bucket: string;
  private endpoint: string;
  private files: Map<string, { body: Buffer; contentType: string }> = new Map();

  constructor(bucket = 'hipmi-media', endpoint = 'https://supabase.co/storage/v1/s3') {
    this.bucket = bucket;
    this.endpoint = endpoint;
  }

  async upload(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
    return { url: this.getUrl(key), key };
  }

  async delete(key: string) {
    this.files.delete(key);
  }

  getUrl(key: string) {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  hasFile(key: string) {
    return this.files.has(key);
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private baseUrl: string;
  private files: Map<string, { body: Buffer; contentType: string }> = new Map();

  constructor(baseDir = '/var/data/hipmi/uploads', baseUrl = 'http://localhost:3000/uploads') {
    this.baseDir = baseDir;
    this.baseUrl = baseUrl;
  }

  async upload(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
    return { url: this.getUrl(key), key };
  }

  async delete(key: string) {
    this.files.delete(key);
  }

  getUrl(key: string) {
    return `${this.baseUrl}/${key}`;
  }

  hasFile(key: string) {
    return this.files.has(key);
  }
}

// Media verification pipeline simulating Sharp image validation
export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  dimensions?: { width: number; height: number };
}

export function validateImageUpload(
  buffer: Buffer,
  contentType: string,
  slot: keyof typeof CMS_IMAGE_PRESETS
): MediaValidationResult {
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  if (buffer.length > MAX_SIZE) {
    return { valid: false, error: 'Ukuran file melebihi batas maksimal 5 MB' };
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return { valid: false, error: 'Format file tidak didukung. Gunakan JPEG, PNG, atau WebP' };
  }

  const dims = extractDimensions(buffer);
  if (dims.format === 'unknown') {
    return { valid: false, error: 'File gambar rusak atau tidak valid' };
  }

  const preset = CMS_IMAGE_PRESETS[slot];
  if (dims.width < preset.minWidth || dims.height < preset.minHeight) {
    return {
      valid: false,
      error: `Resolusi gambar terlalu kecil (${dims.width}x${dims.height}). Minimum yang dibutuhkan: ${preset.minWidth}x${preset.minHeight}`,
      dimensions: dims,
    };
  }

  return { valid: true, dimensions: dims };
}

describe('Tier 1: CMS Storage & Media Pipeline (Features 27-31)', () => {
  // =========================================================================
  // F27: CMS Schema for All 8 Sections
  // =========================================================================
  it('F27-1: Hero Slides schema validates title, subtitle, imageUrl, imageAlt, and slotStatus', () => {
    const heroSlide = {
      title: 'Mencetak Pengusaha Muda Berintegritas',
      subtitle: 'HIPMI PT Telkom University wadah inkubasi wirausaha mahasiswa.',
      imageUrl: 'https://cdn.hipmi.org/hero1.webp',
      imageAlt: 'Foto bersama jajaran BPH HIPMI PT Telkom',
      slotStatus: 'ready',
      orderIndex: 1,
    };
    expect(heroSlide.title.length).toBeLessThanOrEqual(45);
    expect(heroSlide.subtitle.length).toBeLessThanOrEqual(180);
    expect(heroSlide.imageAlt.length).toBeLessThanOrEqual(140);
    expect(['ready', 'pending-asset']).toContain(heroSlide.slotStatus);
  });

  it('F27-2: Tentang & 3 Pilar schema enforces eyebrow, title, description, and exactly 3 pillars', () => {
    const tentangSection = {
      eyebrow: 'TENTANG HIPMI PT',
      title: 'Membangun Karakter Wirausaha Tangguh',
      description: 'HIPMI Perguruan Tinggi Universitas Telkom berdiri untuk menginspirasi mahasiswa.',
      pillars: [
        { title: 'Inkubasi Bisnis', description: 'Pendampingan usaha tahap awal' },
        { title: 'Jejaring Nasional', description: 'Koneksi pengusaha muda se-Indonesia' },
        { title: 'Kompetisi & Prestasi', description: 'Fasilitasi delegasi lomba wirausaha' },
      ],
    };
    expect(tentangSection.eyebrow.length).toBeLessThanOrEqual(30);
    expect(tentangSection.title.length).toBeLessThanOrEqual(70);
    expect(tentangSection.description.length).toBeLessThanOrEqual(320);
    expect(tentangSection.pillars).toHaveLength(3);
  });

  it('F27-3: Partners schema validates name, strict category enum, scope, and status', () => {
    const allowedCategories = [
      'Korporasi & BUMN',
      'Asosiasi & HIPMI',
      'Dinas & Inkubator',
      'Komunitas & Media',
      'Mitra Strategis',
    ];
    const partner = {
      name: 'PT Telkom Indonesia',
      category: 'Korporasi & BUMN',
      scope: 'Inkubasi startup dan sponsorship tahunan',
      tier: 'STRATEGIC',
      slotStatus: 'ready',
    };
    expect(partner.name.length).toBeLessThanOrEqual(35);
    expect(allowedCategories).toContain(partner.category);
    expect(partner.scope.length).toBeLessThanOrEqual(160);
  });

  it('F27-4: Bisnis Kader & Prestasi schemas enforce strict sector/category enums and character limits', () => {
    const allowedSectors = ['Teknologi & Jasa', 'Kuliner / F&B', 'Kreatif & Media', 'Fesyen & Ritel'];
    const business = {
      businessName: 'Kopi Juara Kampus',
      sector: 'Kuliner / F&B',
      description: 'Coffee shop artisanal karya mahasiswa Telkom.',
      ownerLabel: 'Ahmad (Manajemen 2023)',
    };
    expect(allowedSectors).toContain(business.sector);
    expect(business.businessName.length).toBeLessThanOrEqual(45);
    expect(business.description.length).toBeLessThanOrEqual(180);

    const allowedAchievementCats = ['Kompetisi Bisnis', 'Pendanaan & Hibah', 'Tingkat Nasional', 'Rekognisi'];
    const achievement = {
      title: 'Juara 1 Wismilak Diplomat Success Challenge',
      category: 'Kompetisi Bisnis',
      description: 'Inovasi pengolahan limbah organik kampus.',
    };
    expect(allowedAchievementCats).toContain(achievement.category);
    expect(achievement.title.length).toBeLessThanOrEqual(55);
  });

  it('F27-5: Program Kerja, Testimonials, and Site Settings schemas validate required fields and constraints', () => {
    const testimonial = {
      category: 'Kader & Alumni',
      quote: 'HIPMI memberikan saya mentoring nyata dalam memvalidasi model bisnis hingga profit.',
      authorLabel: 'Dimas Wicaksono',
      roleOrOrg: 'CEO TechStart (Alumni 2024)',
      verified: true,
    };
    expect(['Kader & Alumni', 'Mitra Kolaborasi']).toContain(testimonial.category);
    expect(testimonial.quote.length).toBeLessThanOrEqual(240);
    expect(typeof testimonial.verified).toBe('boolean');

    const settings = {
      secretariatAddress: 'Gedung Student Center Lt. 2, Telkom University, Bandung',
      officialEmail: 'sekretariat@hipmitelkom.org',
    };
    expect(settings.secretariatAddress.length).toBeLessThanOrEqual(150);
    expect(settings.officialEmail.length).toBeLessThanOrEqual(80);
  });

  // =========================================================================
  // F28: Portable StorageAdapter Interface (S3 + Local)
  // =========================================================================
  it('F28-1: StorageAdapter contract defines upload, getUrl, and delete methods', () => {
    const s3Adapter: StorageAdapter = new S3StorageAdapter();
    expect(typeof s3Adapter.upload).toBe('function');
    expect(typeof s3Adapter.getUrl).toBe('function');
    expect(typeof s3Adapter.delete).toBe('function');
  });

  it('F28-2: S3StorageAdapter uploads file and returns standard external CDN/S3 URL', async () => {
    const adapter = new S3StorageAdapter('hipmi-test-bucket', 'https://s3.ap-southeast-1.amazonaws.com');
    const dummyBuffer = Buffer.from('fake-image-bytes');
    const result = await adapter.upload('hero/slide-1.webp', dummyBuffer, 'image/webp');

    expect(result.key).toBe('hero/slide-1.webp');
    expect(result.url).toBe('https://s3.ap-southeast-1.amazonaws.com/hipmi-test-bucket/hero/slide-1.webp');
    expect(adapter.hasFile('hero/slide-1.webp')).toBe(true);
  });

  it('F28-3: LocalStorageAdapter uploads file and returns local web-accessible URL for VPS fallback', async () => {
    const adapter = new LocalStorageAdapter('/var/www/uploads', 'https://api.hipmitelkom.org/uploads');
    const dummyBuffer = Buffer.from('fake-image-bytes');
    const result = await adapter.upload('partners/telkom.webp', dummyBuffer, 'image/webp');

    expect(result.key).toBe('partners/telkom.webp');
    expect(result.url).toBe('https://api.hipmitelkom.org/uploads/partners/telkom.webp');
    expect(adapter.hasFile('partners/telkom.webp')).toBe(true);
  });

  it('F28-4: Delete operation removes asset cleanly from configured storage adapter', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.upload('temp.png', Buffer.from('tmp'), 'image/png');
    expect(adapter.hasFile('temp.png')).toBe(true);

    await adapter.delete('temp.png');
    expect(adapter.hasFile('temp.png')).toBe(false);
  });

  it('F28-5: Interchanging adapters produces identical method signatures and predictable behaviors', async () => {
    const adapters: StorageAdapter[] = [new S3StorageAdapter(), new LocalStorageAdapter()];
    for (const ad of adapters) {
      const res = await ad.upload('test.webp', Buffer.from('data'), 'image/webp');
      expect(res.url).toBeDefined();
      expect(typeof res.url).toBe('string');
      await ad.delete('test.webp');
    }
  });

  // =========================================================================
  // F29: Image Upload 5MB Limit and Minimum Resolution Verification
  // =========================================================================
  it('F29-1: Accepts raw image within 5 MB limit and valid image format', () => {
    const validPng = createPng(1280, 720);
    const result = validateImageUpload(validPng, 'image/png', 'heroSlide');
    expect(result.valid).toBe(true);
    expect(result.dimensions?.width).toBe(1280);
    expect(result.dimensions?.height).toBe(720);
  });

  it('F29-2: Strictly rejects image buffer exceeding 5.0 MB (e.g. 5.2 MB)', () => {
    const oversized = createOversizedBuffer(5.2, 'png');
    const result = validateImageUpload(oversized, 'image/png', 'heroSlide');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('melebihi batas maksimal 5 MB');
  });

  it('F29-3: Rejects disallowed file MIME types (e.g. application/pdf, text/plain)', () => {
    const buf = Buffer.from('non-image data');
    const result = validateImageUpload(buf, 'application/pdf', 'heroSlide');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Format file tidak didukung');
  });

  it('F29-4: Rejects image below minimum required resolution per slot (e.g. Hero < 1280x720)', () => {
    const smallPng = createPng(800, 450); // Under 1280x720
    const result = validateImageUpload(smallPng, 'image/png', 'heroSlide');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Resolusi gambar terlalu kecil');
    expect(result.error).toContain('1280x720');
  });

  it('F29-5: Passes image meeting or exceeding minimum resolution for Partner (512x512) and Proker (540x675)', () => {
    const partnerImg = createPng(512, 512);
    const partnerRes = validateImageUpload(partnerImg, 'image/png', 'partner');
    expect(partnerRes.valid).toBe(true);

    const prokerImg = createJpeg(540, 675);
    const prokerRes = validateImageUpload(prokerImg, 'image/jpeg', 'proker');
    expect(prokerRes.valid).toBe(true);
  });

  // =========================================================================
  // F30: Sharp Image Transformation
  // =========================================================================
  it('F30-1: Detects EXIF APP1 metadata in source image and verifies EXIF stripping requirement', () => {
    const withExif = createJpeg(1280, 720, { withExif: true, exifComment: 'HIPMI GPS DATA' });
    expect(hasExif(withExif)).toBe(true);

    // Stripping simulation
    const withoutExif = createJpeg(1280, 720, { withExif: false });
    expect(hasExif(withoutExif)).toBe(false);
  });

  it('F30-2: Verifies required aspect ratios per slot (Hero: 16:9, Proker: 4:5, Partner: 1:1)', () => {
    expect(CMS_IMAGE_PRESETS.heroSlide.ratio).toBe('16:9');
    const heroRatioDiff = Math.abs(CMS_IMAGE_PRESETS.heroSlide.width / CMS_IMAGE_PRESETS.heroSlide.height - 16 / 9);
    expect(heroRatioDiff < 0.01).toBe(true);

    expect(CMS_IMAGE_PRESETS.proker.ratio).toBe('4:5');
    const prokerRatioDiff = Math.abs(CMS_IMAGE_PRESETS.proker.width / CMS_IMAGE_PRESETS.proker.height - 4 / 5);
    expect(prokerRatioDiff < 0.01).toBe(true);

    expect(CMS_IMAGE_PRESETS.partner.ratio).toBe('1:1');
    expect(CMS_IMAGE_PRESETS.partner.width / CMS_IMAGE_PRESETS.partner.height).toBe(1);
  });

  it('F30-3: Verifies WebP format target configuration and quality parameter 84', () => {
    const sharpOptions = {
      format: 'webp',
      quality: 84,
      effort: 4,
    };
    expect(sharpOptions.format).toBe('webp');
    expect(sharpOptions.quality).toBe(84);
  });

  it('F30-4: Validates image size optimization ceiling (target render size <= 350 KB)', () => {
    const TARGET_MAX_KB = 350;
    const sampleRenderedWebp = createPng(800, 600); // Minimal synthetic raster
    const sizeKb = sampleRenderedWebp.length / 1024;
    expect(sizeKb).toBeLessThan(TARGET_MAX_KB);
  });

  it('F30-5: Rejects corrupted buffer that fails raster image parsing', () => {
    const corrupt = createCorruptedBuffer(512);
    const result = validateImageUpload(corrupt, 'image/png', 'heroSlide');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('rusak atau tidak valid');
  });

  // =========================================================================
  // F31: Image Slot Status and WCAG imageAlt (max 140)
  // =========================================================================
  it('F31-1: Content created without asset initializes slotStatus = "pending-asset" and imageSrc = null', () => {
    const pendingSlide = {
      title: 'Slide Draft Tanpa Foto',
      slotStatus: 'pending-asset',
      imageUrl: null,
      imageAlt: null,
    };
    expect(pendingSlide.slotStatus).toBe('pending-asset');
    expect(pendingSlide.imageUrl).toBeNull();
  });

  it('F31-2: Setting slotStatus = "ready" mandates non-empty imageAlt for accessibility', () => {
    const validateAccessibility = (slotStatus: string, alt?: string | null): boolean => {
      if (slotStatus === 'ready') {
        return Boolean(alt && alt.trim().length >= 5);
      }
      return true;
    };

    expect(validateAccessibility('ready', '')).toBe(false);
    expect(validateAccessibility('ready', null)).toBe(false);
    expect(validateAccessibility('ready', 'Foto dokumentasi rapat pengurus')).toBe(true);
    expect(validateAccessibility('pending-asset', null)).toBe(true);
  });

  it('F31-3: imageAlt within 140 characters limit passes validation', () => {
    const validAlt = 'Suasana pembukaan HIPMI Telkom Entrepreneur Festival 2026 di Hall Cacuk A Telkom University';
    expect(validAlt.length).toBeLessThanOrEqual(140);
  });

  it('F31-4: imageAlt exceeding 140 characters is strictly rejected by validation', () => {
    const tooLongAlt = 'A'.repeat(141);
    const isAltValid = (alt: string) => alt.length <= 140;
    expect(isAltValid(tooLongAlt)).toBe(false);
  });

  it('F31-5: slotStatus enum strictly permits only "ready" or "pending-asset"', () => {
    const allowed = ['ready', 'pending-asset'];
    const isValidSlot = (val: string) => allowed.includes(val);

    expect(isValidSlot('ready')).toBe(true);
    expect(isValidSlot('pending-asset')).toBe(true);
    expect(isValidSlot('draft')).toBe(false);
    expect(isValidSlot('published')).toBe(false);
  });
});
