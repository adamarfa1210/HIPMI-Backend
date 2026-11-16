import { describe, it, expect, beforeAll, afterAll } from '../helpers/test-runner.js';
import {
  createTestToken,
  decodeToken,
  verifyToken,
  getAuthHeaders,
  TEST_USERS,
  RoleType,
} from '../helpers/auth-helper.js';
import {
  createPng,
  createJpeg,
  createImage,
  createOversizedBuffer,
  createCorruptedBuffer,
  extractDimensions,
  hasExif,
  CMS_IMAGE_PRESETS,
} from '../helpers/image-generator.js';
import { RevalidateMock } from '../helpers/revalidate-mock.js';
import { dbFixtures, dbStore } from '../helpers/db-fixtures.js';
import { AppClient, TestResponse } from '../helpers/app-client.js';

describe('E2E Test Harness Smoke Suite', () => {
  describe('1. Auth Helper Module', () => {
    const roles: RoleType[] = ['admin', 'topman', 'kabid', 'kadiv', 'staff', 'kader_1'];

    it('generates valid tokens with correct payload for all 6 roles', () => {
      for (const role of roles) {
        const token = createTestToken(role);
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');

        const decoded = decodeToken(token);
        expect(decoded.header.alg).toBe('HS256');
        expect(decoded.header.typ).toBe('JWT');
        expect(decoded.payload.roleCode).toBe(role);
        expect(decoded.payload.nim).toBe(TEST_USERS[role].nim);
        expect(decoded.payload.fullName).toBe(TEST_USERS[role].fullName);
        expect(decoded.payload.id).toBe(TEST_USERS[role].id);
        expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.iat);
      }
    });

    it('verifies valid token signature cryptographically', () => {
      const token = createTestToken('admin');
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload.roleCode).toBe('admin');
      expect(result.payload.roleName).toBe('Admin');
    });

    it('rejects tampered token or incorrect secret', () => {
      const token = createTestToken('admin');
      const badResult = verifyToken(token, 'wrong-secret-key');
      expect(badResult.valid).toBe(false);
      expect(badResult.error).toContain('Invalid signature');

      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      const tamperedResult = verifyToken(tamperedToken);
      expect(tamperedResult.valid).toBe(false);
    });

    it('formats HTTP Authorization header correctly', () => {
      const headers = getAuthHeaders('kabid');
      expect(headers.Authorization).toBeDefined();
      expect(headers.Authorization.startsWith('Bearer ')).toBe(true);

      const token = headers.Authorization.replace('Bearer ', '');
      const verification = verifyToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.payload.roleCode).toBe('kabid');
    });
  });

  describe('2. Image Generator Module', () => {
    it('creates minimal valid PNG with exact requested dimensions', () => {
      const width = 1280;
      const height = 720;
      const pngBuf = createPng(width, height);

      expect(pngBuf).toBeDefined();
      expect(pngBuf.length).toBeGreaterThan(32);

      const info = extractDimensions(pngBuf);
      expect(info.format).toBe('png');
      expect(info.width).toBe(width);
      expect(info.height).toBe(height);
    });

    it('creates minimal valid JPEG with exact requested dimensions', () => {
      const width = 540;
      const height = 675; // Proker 4:5 ratio
      const jpegBuf = createJpeg(width, height);

      expect(jpegBuf).toBeDefined();
      expect(jpegBuf.length).toBeGreaterThan(64);

      const info = extractDimensions(jpegBuf);
      expect(info.format).toBe('jpeg');
      expect(info.width).toBe(width);
      expect(info.height).toBe(height);
    });

    it('synthesizes JPEG with mock EXIF tags and detects it', () => {
      const withExifBuf = createJpeg(800, 600, { withExif: true, exifComment: 'HIPMI TEST' });
      expect(hasExif(withExifBuf)).toBe(true);

      const noExifBuf = createJpeg(800, 600, { withExif: false });
      expect(hasExif(noExifBuf)).toBe(false);
    });

    it('generates oversized buffer exceeding 5MB to test upload size limits', () => {
      const oversized = createOversizedBuffer(5.2, 'png');
      expect(oversized.length).toBeGreaterThan(5.2 * 1024 * 1024);

      const dims = extractDimensions(oversized);
      expect(dims.format).toBe('png');
      expect(dims.width).toBe(1280);
      expect(dims.height).toBe(720);
    });

    it('generates corrupted buffers that fail image parsing', () => {
      const corrupt = createCorruptedBuffer(128);
      const dims = extractDimensions(corrupt);
      expect(dims.format).toBe('unknown');
      expect(dims.width).toBe(0);
      expect(dims.height).toBe(0);
    });

    it('provides standard CMS preset dimensions matching BACKEND-REQUIREMENTS.md', () => {
      expect(CMS_IMAGE_PRESETS.heroSlide.width).toBe(1280);
      expect(CMS_IMAGE_PRESETS.heroSlide.height).toBe(720);
      expect(CMS_IMAGE_PRESETS.partner.width).toBe(512);
      expect(CMS_IMAGE_PRESETS.partner.height).toBe(512);
      expect(CMS_IMAGE_PRESETS.proker.width).toBe(540);
      expect(CMS_IMAGE_PRESETS.proker.height).toBe(675);
    });
  });

  describe('3. Revalidate Mock Receiver Module', () => {
    const mock = new RevalidateMock('test-revalidate-secret-123');

    beforeAll(async () => {
      await mock.start();
    });

    afterAll(async () => {
      await mock.stop();
    });

    it('accepts valid revalidate POST request with secret and records payload', async () => {
      mock.clear();
      const res = await fetch(mock.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': 'test-revalidate-secret-123',
        },
        body: JSON.stringify({
          tags: ['hero-slides', 'partners'],
          paths: ['/id', '/id/tentang'],
        }),
      });

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.revalidated).toBe(true);

      mock.assertCallCount(1);
      mock.assertReceivedTag('hero-slides');
      mock.assertReceivedTag('partners');
      mock.assertReceivedPath('/id');
    });

    it('rejects revalidate request with invalid secret', async () => {
      const res = await fetch(mock.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': 'wrong-secret',
        },
        body: JSON.stringify({ tags: ['hero-slides'] }),
      });

      expect(res.status).toBe(401);
      const body: any = await res.json();
      expect(body.revalidated).toBe(false);
      expect(body.message).toContain('Invalid revalidation secret');
    });

    it('supports in-process direct recording without HTTP roundtrip', () => {
      mock.clear();
      mock.recordDirect({ tags: ['prestasi'], paths: ['/id/prestasi'] }, 'test-revalidate-secret-123');

      mock.assertCallCount(1);
      mock.assertReceivedTag('prestasi');
      const last = mock.getLastCall();
      expect(last?.isValidSecret).toBe(true);
    });
  });

  describe('4. DB Fixtures & Relational Store Module', () => {
    it('seeds and verifies 6 system default roles and 9 modules', async () => {
      await dbFixtures.seedAll();

      expect(dbStore.roles.size).toBe(6);
      expect(dbStore.modules.size).toBe(9);
      expect(dbStore.permissions.size).toBe(54); // 6 roles * 9 modules

      const adminRole = Array.from(dbStore.roles.values()).find((r: any) => r.name === 'Admin');
      expect(adminRole).toBeDefined();
      expect(adminRole?.isSystemDefault).toBe(true);
    });

    it('seeds and cleans up cadre entities', async () => {
      await dbFixtures.cleanupAll();
      expect(dbStore.kaders.size).toBe(6); // Default 6 seeded users

      const customCadres = await dbFixtures.seedCadres([
        { nim: '1301219999', fullName: 'Calon Kader Baru', prodi: 'S1 Informatika' },
      ]);
      expect(customCadres.length).toBe(1);
      expect(dbStore.kaders.size).toBe(7);

      await dbFixtures.cleanupAll();
      expect(dbStore.kaders.size).toBe(6);
    });

    it('seeds transactions, prokers, meetings, and CMS items', async () => {
      const txs = await dbFixtures.seedTransactions([
        { amount: 1500000, type: 'CASH_IN', category: 'Sponsor' },
      ]);
      expect(txs.length).toBe(1);
      expect(dbStore.transactions.size).toBe(1);

      const prokers = await dbFixtures.seedProkers([{ name: 'HIPMI Goes to Campus' }]);
      expect(prokers.length).toBe(1);
      expect(dbStore.prokers.size).toBe(1);

      const cms = await dbFixtures.seedCmsEntities({
        heroSlides: [{ title: 'Slide Utama' }],
        partners: [{ name: 'Mitra Industri' }],
      });
      expect(cms.heroSlides.length).toBe(1);
      expect(cms.partners.length).toBe(1);
      expect(dbStore.heroSlides.size).toBe(1);
      expect(dbStore.partners.size).toBe(1);
    });
  });

  describe('5. App Client & Response Assertions Module', () => {
    it('wraps native response in TestResponse with fluent assertions', async () => {
      const mockRawResponse = new Response(
        JSON.stringify({ success: true, message: 'Operasi berhasil', data: { id: 123 } }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const res = new TestResponse(mockRawResponse);
      res.expectStatus(200);
      res.expectOk();

      await res.expectSuccess(true);
      await res.expectJsonMatch({ message: 'Operasi berhasil' });

      const data = await res.json();
      expect(data.data.id).toBe(123);
    });

    it('properly fails assertion on mismatch status', () => {
      const mockRawResponse = new Response('Bad request', { status: 400 });
      const res = new TestResponse(mockRawResponse);

      expect(() => res.expectStatus(200)).toThrow('Expected HTTP status 200, but got 400');
      expect(() => res.expectOk()).toThrow('Expected successful 2xx status');
      res.expectBadRequest();
    });

    it('creates role-authenticated sub-clients with Bearer tokens', () => {
      const client = new AppClient();
      const adminClient = client.as('admin');
      const staffClient = client.as('staff');

      expect(adminClient).toBeDefined();
      expect(staffClient).toBeDefined();
    });

    it('successfully executes opaque-box request against Hono app /health endpoint', async () => {
      const client = new AppClient();
      const res = await client.get('/health');
      res.expectOk();
      res.expectStatus(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.service).toBe('hipmi-pt-telkom-api');
      expect(json.timestamp).toBeDefined();
    });
  });
});
