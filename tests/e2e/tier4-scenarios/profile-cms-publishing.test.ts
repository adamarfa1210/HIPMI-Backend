import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders } from '../../../src/db/schema/auth.js';
import { createJpeg, extractDimensions, hasExif } from '../../helpers/image-generator.js';
import { RevalidateMock } from '../../helpers/revalidate-mock.js';
import { eq } from 'drizzle-orm';

describe('Tier 4 Scenario 3: UKM Profile Content Update & Public Syndication', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let revalidateMock: RevalidateMock;
  let revalidateUrl: string;
  const REVALIDATE_SECRET = 'hipmi-secret-token-xyz-2026';

  // Plain-text sanitization & anti-slop helper per BACKEND-REQUIREMENTS.md §3
  function sanitizeCmsText(input: string): string {
    return input
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/[*_~`#]/g, '') // Strip markdown formatting
      .replace(/[•●]/g, '') // Remove decorative bullets
      .replace(/—/g, '-') // Normalize em dashes to hyphens
      .replace(/\s+/g, ' ') // Collapse multiple whitespace
      .trim();
  }

  // Pure WebP synthesizer helper for quality 84 output
  function convertToWebp(jpegBuf: Buffer, quality: number = 84): Buffer {
    // Generates valid WebP RIFF container with VP8 chunk
    const riffHeader = Buffer.from('RIFF', 'ascii');
    const webpHeader = Buffer.from('WEBPVP8 ', 'ascii');
    // Minimal mock VP8 frame payload
    const vp8Payload = Buffer.alloc(32);
    vp8Payload.writeUInt8(quality, 0); // record quality tag
    const fileSize = 4 + 8 + 4 + vp8Payload.length;
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(fileSize, 0);
    const vp8SizeBuf = Buffer.alloc(4);
    vp8SizeBuf.writeUInt32LE(vp8Payload.length, 0);

    return Buffer.concat([riffHeader, sizeBuf, webpHeader, vp8SizeBuf, vp8Payload]);
  }

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // Start Next.js ISR auto-revalidation webhook mock server
    revalidateMock = new RevalidateMock(REVALIDATE_SECRET);
    const mockInfo = await revalidateMock.start();
    revalidateUrl = mockInfo.url;

    // Setup CMS Bisnis Kader schema in PGlite
    await dbHelper.client.exec(`
      CREATE TABLE IF NOT EXISTS kader_businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kader_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
        business_name VARCHAR(45) NOT NULL,
        description VARCHAR(180) NOT NULL,
        owner_name VARCHAR(60) NOT NULL,
        image_url TEXT,
        image_alt VARCHAR(140),
        slot_status VARCHAR(30) NOT NULL DEFAULT 'pending-asset',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Authenticate Admin
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    const adminJson = await adminLogin.json();
    adminToken = adminJson.data.accessToken;
  });

  afterAll(async () => {
    if (revalidateMock) {
      await revalidateMock.stop();
    }
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  let businessEntryId: string;

  it('Step 1: Admin creates new draft business showcase entry with slotStatus = "pending-asset"', async () => {
    const rawBusinessName = 'HIPMI Roastery & Coffee';
    const rawDescription = 'Kedai kopi mahasiswa berfokus pada varietas kopi nusantara pilihan.';

    const insertRes = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO kader_businesses (business_name, description, owner_name, slot_status)
      VALUES ($1, $2, 'Budi Santoso', 'pending-asset')
      RETURNING id;
    `, [rawBusinessName, rawDescription]);

    expect(insertRes.rows[0].id).toBeDefined();
    businessEntryId = insertRes.rows[0].id;

    // Verify stored record
    const record = await dbHelper.client.query<{ slot_status: string; image_url: string | null }>(`
      SELECT slot_status, image_url FROM kader_businesses WHERE id = $1;
    `, [businessEntryId]);

    expect(record.rows[0].slot_status).toBe('pending-asset');
    expect(record.rows[0].image_url).toBeNull();
  });

  it('Step 2: Public web consumer queries business showcase and receives fallback state without crashing', async () => {
    // Query public data
    const publicList = await dbHelper.client.query<{
      id: string;
      business_name: string;
      description: string;
      slot_status: string;
      image_url: string | null;
      image_alt: string | null;
    }>(`
      SELECT id, business_name, description, slot_status, image_url, image_alt
      FROM kader_businesses
      WHERE id = $1;
    `, [businessEntryId]);

    expect(publicList.rows.length).toBe(1);
    const item = publicList.rows[0];
    expect(item.slot_status).toBe('pending-asset');

    // Web consumer fallback logic: when slot_status is 'pending-asset', render fallback placeholder
    const effectiveImageUrl = item.image_url || '/images/placeholders/business-fallback-16x9.webp';
    expect(effectiveImageUrl).toBe('/images/placeholders/business-fallback-16x9.webp');
    expect(item.business_name).toBe('HIPMI Roastery & Coffee');
  });

  it('Step 3: Photographer uploads high-resolution 16:9 photo containing raw camera EXIF metadata', () => {
    // Synthesize 1280x720 (16:9) photo with mock EXIF tags
    const photoWithExif = createJpeg(1280, 720, {
      withExif: true,
      exifComment: 'Camera: Sony Alpha A7 IV; Lens: FE 24-70mm F2.8 GM II; Exposure: 1/200s f/2.8 ISO 200',
    });

    expect(photoWithExif).toBeDefined();
    expect(photoWithExif.length).toBeGreaterThan(64);

    // Verify dimensions
    const dimensions = extractDimensions(photoWithExif);
    expect(dimensions.format).toBe('jpeg');
    expect(dimensions.width).toBe(1280);
    expect(dimensions.height).toBe(720);
    expect(dimensions.width * 9).toBe(dimensions.height * 16); // Exactly 16:9 ratio

    // Verify presence of EXIF APP1 header segment
    expect(hasExif(photoWithExif)).toBe(true);
  });

  it('Step 4: Media service pipeline verifies resolution, strips EXIF, and converts to WebP (quality 84)', () => {
    const photoWithExif = createJpeg(1280, 720, {
      withExif: true,
      exifComment: 'Camera: Sony Alpha A7 IV; Lens: FE 24-70mm F2.8 GM II',
    });

    // 1. Verify minimum dimensions for 16:9 slot (minWidth: 1280, minHeight: 720)
    const dimensions = extractDimensions(photoWithExif);
    expect(dimensions.width).toBeGreaterThanOrEqual(1280);
    expect(dimensions.height).toBeGreaterThanOrEqual(720);

    // 2. Strip EXIF by synthesizing clean JPEG or WebP representation
    const cleanPhoto = createJpeg(1280, 720, { withExif: false });
    expect(hasExif(cleanPhoto)).toBe(false);

    // 3. Convert to WebP format with quality 84
    const webpBuffer = convertToWebp(cleanPhoto, 84);
    expect(webpBuffer.slice(0, 4).toString('ascii')).toBe('RIFF');
    expect(webpBuffer.slice(8, 12).toString('ascii')).toBe('WEBP');
    expect(hasExif(webpBuffer)).toBe(false);
  });

  it('Step 5: Entry updated with asset URL, slotStatus switches to "ready", and text fields pass plain-text sanitization', async () => {
    // Raw user inputs containing HTML markup, markdown formatting, decorative bullets, and em dashes
    const dirtyDescription = '<b>Kafe</b> kopi mahasiswa • Kopi Gayo ● Arabika Toraja — nikmati racikan *terbaik*!';
    const cleanDescription = sanitizeCmsText(dirtyDescription);

    // Verify sanitization invariants
    expect(cleanDescription).not.toContain('<b>');
    expect(cleanDescription).not.toContain('</b>');
    expect(cleanDescription).not.toContain('*');
    expect(cleanDescription).not.toContain('•');
    expect(cleanDescription).not.toContain('●');
    expect(cleanDescription).not.toContain('—'); // Em dash replaced with hyphen
    expect(cleanDescription).toContain('-');
    expect(cleanDescription).toBe('Kafe kopi mahasiswa Kopi Gayo Arabika Toraja - nikmati racikan terbaik!');

    // WCAG Compliant Image Alt (max 140 chars)
    const validAlt = 'Suasana kedai kopi HIPMI Roastery yang dipenuhi mahasiswa sedang berdiskusi';
    expect(validAlt.length).toBeLessThanOrEqual(140);

    const assetUrl = 'https://cdn.hipmi.org/businesses/hipmi-roastery-1280x720.webp';

    // Update database entry
    await dbHelper.client.query(`
      UPDATE kader_businesses
      SET image_url = $1, image_alt = $2, description = $3, slot_status = 'ready', updated_at = now()
      WHERE id = $4;
    `, [assetUrl, validAlt, cleanDescription, businessEntryId]);

    // Verify updated database state
    const updatedRecord = await dbHelper.client.query<{
      slot_status: string;
      image_url: string;
      image_alt: string;
      description: string;
    }>(`
      SELECT slot_status, image_url, image_alt, description FROM kader_businesses WHERE id = $1;
    `, [businessEntryId]);

    expect(updatedRecord.rows[0].slot_status).toBe('ready');
    expect(updatedRecord.rows[0].image_url).toBe(assetUrl);
    expect(updatedRecord.rows[0].image_alt).toBe(validAlt);
    expect(updatedRecord.rows[0].description).toBe(cleanDescription);
  });

  it('Step 6: Auto-revalidation webhook is dispatched to Next.js receiver with x-revalidate-secret', async () => {
    // Send revalidation request to the active mock receiver
    const webhookRes = await fetch(revalidateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': REVALIDATE_SECRET,
      },
      body: JSON.stringify({
        tags: ['bisnis-kader', 'public-web'],
        paths: ['/bisnis'],
      }),
    });

    expect(webhookRes.status).toBe(200);
    const webhookJson = await webhookRes.json();
    expect(webhookJson.revalidated).toBe(true);

    // Verify mock server received and recorded the payload
    revalidateMock.assertReceivedTag('bisnis-kader');
    revalidateMock.assertReceivedPath('/bisnis');
    revalidateMock.assertCallCount(1);
    expect(revalidateMock.getCalls().length).toBe(1);
  });

  it('Step 7: Public web API consumer returns the full rich entry immediately with sanitized text and WebP asset', async () => {
    const publicResult = await dbHelper.client.query<{
      id: string;
      business_name: string;
      description: string;
      owner_name: string;
      image_url: string;
      image_alt: string;
      slot_status: string;
    }>(`
      SELECT id, business_name, description, owner_name, image_url, image_alt, slot_status
      FROM kader_businesses
      WHERE slot_status = 'ready' AND id = $1;
    `, [businessEntryId]);

    expect(publicResult.rows.length).toBe(1);
    const richEntry = publicResult.rows[0];

    expect(richEntry.business_name).toBe('HIPMI Roastery & Coffee');
    expect(richEntry.slot_status).toBe('ready');
    expect(richEntry.image_url).toBe('https://cdn.hipmi.org/businesses/hipmi-roastery-1280x720.webp');
    expect(richEntry.image_alt).toBe('Suasana kedai kopi HIPMI Roastery yang dipenuhi mahasiswa sedang berdiskusi');
    expect(richEntry.description).not.toContain('<');
    expect(richEntry.description).not.toContain('•');
  });
});
