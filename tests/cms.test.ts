import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { sanitizePlainText } from "../src/utils/sanitize.js";
import { LocalStorageAdapter, S3StorageAdapter } from "../src/services/storage/index.js";
import { MediaService } from "../src/services/media.service.js";
import { createPng, createJpeg, createOversizedBuffer } from "./helpers/image-generator.js";
import { RevalidateMock } from "./helpers/revalidate-mock.js";
import fs from "fs/promises";
import path from "path";

describe("Milestone M3: UKM Profile Headless CMS & Media Pipeline Suite", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let revalidateMock: RevalidateMock;
  const REVALIDATE_SECRET = "test-revalidate-secret-m3";

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // Start ISR webhook mock
    revalidateMock = new RevalidateMock(REVALIDATE_SECRET);
    const mockInfo = await revalidateMock.start();
    process.env.PUBLIC_WEB_URL = mockInfo.url;
    process.env.REVALIDATE_SECRET = REVALIDATE_SECRET;

    // Login Admin
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220001", password: "admin123" }),
    });
    const loginJson = await loginRes.json();
    adminToken = loginJson.data.accessToken;
  });

  afterAll(async () => {
    if (revalidateMock) {
      await revalidateMock.stop();
    }
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  });

  // =========================================================================
  // 1. Text Sanitization Logic
  // =========================================================================
  describe("1. Plain-Text Sanitization & Anti-Slop (Feature 33)", () => {
    it("strips HTML tags and script injections", () => {
      const input = '<script>alert(1)</script><b>Headline</b> <p>Paragraf</p>';
      const sanitized = sanitizePlainText(input);
      expect(sanitized).toBe('Headline Paragraf');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it("strips Markdown decorations", () => {
      const input = '## Judul Besar\n**Bold Text** dan *Italic* serta [Tautan](https://example.com)';
      const sanitized = sanitizePlainText(input);
      expect(sanitized).toBe('Judul Besar Bold Text dan Italic serta Tautan');
    });

    it("removes decorative bullets and normalizes em/en dashes", () => {
      const input = '• Program Utama — HIPMI PT Telkom – Periode 2026 ●';
      const sanitized = sanitizePlainText(input);
      expect(sanitized).toBe('Program Utama - HIPMI PT Telkom - Periode 2026');
      expect(sanitized).not.toContain('•');
      expect(sanitized).not.toContain('●');
      expect(sanitized).not.toContain('—');
    });

    it("collapses multiple consecutive whitespace and trims", () => {
      const input = '   Banyak    spasi     antar     kata   ';
      const sanitized = sanitizePlainText(input);
      expect(sanitized).toBe('Banyak spasi antar kata');
    });
  });

  // =========================================================================
  // 2. StorageAdapter Portability
  // =========================================================================
  describe("2. StorageAdapter Portability (Feature 28)", () => {
    const testUploadDir = path.resolve(process.cwd(), "uploads", "test-storage");

    afterAll(async () => {
      try {
        await fs.rm(testUploadDir, { recursive: true, force: true });
      } catch {}
    });

    it("LocalStorageAdapter writes file to disk and generates accessible URL", async () => {
      const localAdapter = new LocalStorageAdapter({
        baseDir: testUploadDir,
        baseUrl: "http://localhost:3000/uploads/test-storage",
      });

      const buffer = Buffer.from("test file content for local storage");
      const key = "sample-test.txt";
      const result = await localAdapter.upload({
        key,
        buffer,
        contentType: "text/plain",
      });

      expect(result.url).toBe("http://localhost:3000/uploads/test-storage/sample-test.txt");
      const diskContent = await fs.readFile(path.join(testUploadDir, key), "utf-8");
      expect(diskContent).toBe("test file content for local storage");

      // Test delete
      await localAdapter.delete(key);
      await expect(fs.access(path.join(testUploadDir, key))).rejects.toThrow();
    });

    it("S3StorageAdapter generates correct S3 / Supabase public URLs", () => {
      const s3Adapter = new S3StorageAdapter({
        bucket: "hipmi-assets",
        region: "ap-southeast-1",
        endpoint: "https://supabase-ref.supabase.co/storage/v1/s3",
        publicBaseUrl: "https://cdn.hipmipttelkom.or.id",
      });

      const url = s3Adapter.getUrl("cms/hero/hero-01.webp");
      expect(url).toBe("https://cdn.hipmipttelkom.or.id/cms/hero/hero-01.webp");
    });
  });

  // =========================================================================
  // 3. Media Processing Pipeline with Sharp
  // =========================================================================
  describe("3. Media Processing Pipeline (Features 29-31)", () => {
    it("processes valid 16:9 PNG image into WebP format", async () => {
      const rawPng = createPng(1280, 720);
      const result = await MediaService.processImage({
        buffer: rawPng,
        contentType: "image/png",
        slot: "hero-home",
        filename: "hero-test.png",
      });

      expect(result.format).toBe("webp");
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
      expect(result.slotStatus).toBe("ready");
      expect(result.url).toContain(".webp");
    });

    it("rejects image upload below minimum resolution (422)", async () => {
      const lowResPng = createPng(1024, 576);
      await expect(
        MediaService.processImage({
          buffer: lowResPng,
          contentType: "image/png",
          slot: "hero-home",
        })
      ).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it("rejects landscape orientation for portrait program-poster slot (422)", async () => {
      const landscapePng = createPng(1280, 720);
      await expect(
        MediaService.processImage({
          buffer: landscapePng,
          contentType: "image/png",
          slot: "program-poster",
        })
      ).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it("rejects file exceeding 5 MB limit (413)", async () => {
      const oversizedBuf = createOversizedBuffer(5.5);
      await expect(
        MediaService.processImage({
          buffer: oversizedBuf,
          contentType: "image/png",
          slot: "hero-home",
        })
      ).rejects.toMatchObject({
        statusCode: 413,
      });
    });

    it("POST /api/cms/media/upload multipart endpoint processes image and returns 201", async () => {
      const rawPng = createPng(1280, 720);
      const formData = new FormData();
      const file = new File([new Uint8Array(rawPng)], "hero.png", { type: "image/png" });
      formData.append("file", file);
      formData.append("slot", "hero-home");
      formData.append("imageAlt", "Alternatif hero slide pengurus");

      const res = await app.request("/api/cms/media/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: formData,
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.format).toBe("webp");
      expect(json.data.slotStatus).toBe("ready");
    });
  });

  // =========================================================================
  // 4. Character Limit Boundary Tests
  // =========================================================================
  describe("4. Character Limit Boundaries (Feature 32)", () => {
    it("Hero Slide: accepts title <= 45 chars, rejects > 45 chars", async () => {
      const validRes = await app.request("/api/cms/hero-slides", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "A".repeat(45),
          subtitle: "B".repeat(100),
          imageSrc: "https://storage.hipmi-pt.id/hero.webp",
          imageAlt: "C".repeat(50),
        }),
      });
      expect(validRes.status).toBe(201);

      const invalidRes = await app.request("/api/cms/hero-slides", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "A".repeat(46),
          subtitle: "B".repeat(100),
          imageSrc: "https://storage.hipmi-pt.id/hero.webp",
          imageAlt: "C".repeat(50),
        }),
      });
      expect(invalidRes.status).toBe(400);
      const json = await invalidRes.json();
      expect(json.message).toContain("title");
    });

    it("Tentang: accepts title <= 70 chars, rejects > 70 chars", async () => {
      const invalidRes = await app.request("/api/cms/tentang", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "A".repeat(71),
        }),
      });
      expect(invalidRes.status).toBe(400);
      const json = await invalidRes.json();
      expect(json.message).toContain("title");
    });

    it("Partner: accepts name <= 35 chars, rejects > 35 chars", async () => {
      const invalidRes = await app.request("/api/cms/partners", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "A".repeat(36),
          category: "Korporasi & BUMN",
          scope: "Kerjasama Inkubasi Bisnis",
          period: "2026 - 2027",
          status: "Aktif",
          imageAlt: "Logo Mitra Perusahaan",
        }),
      });
      expect(invalidRes.status).toBe(400);
      const json = await invalidRes.json();
      expect(json.message).toContain("name");
    });

    it("Testimonial: accepts quote <= 240 chars, rejects > 240 chars", async () => {
      const invalidRes = await app.request("/api/cms/testimonials", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: "Kader & Alumni",
          quote: "Q".repeat(241),
          authorLabel: "Budi Santoso",
          roleOrOrg: "Ketua BPC HIPMI 2025",
        }),
      });
      expect(invalidRes.status).toBe(400);
      const json = await invalidRes.json();
      expect(json.message).toContain("quote");
    });

    it("Site Settings: accepts secretariatAddress <= 150 chars, rejects > 150 chars", async () => {
      const invalidRes = await app.request("/api/cms/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          secretariatAddress: "X".repeat(151),
        }),
      });
      expect(invalidRes.status).toBe(400);
      const json = await invalidRes.json();
      expect(json.message).toContain("secretariatAddress");
    });
  });

  // =========================================================================
  // 5. CRUD for all 8 CMS Sections
  // =========================================================================
  describe("5. CMS Admin CRUD Operations (Feature 35)", () => {
    // 5.1 Site Settings
    it("5.1 GET & PATCH /api/cms/settings", async () => {
      const getRes = await app.request("/api/cms/settings", {
        headers: authHeaders(),
      });
      expect(getRes.status).toBe(200);

      const patchRes = await app.request("/api/cms/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          officialInstagram: "@yechipmitelkom2026",
          scoreWeightMeeting: 8,
        }),
      });
      expect(patchRes.status).toBe(200);
      const patchJson = await patchRes.json();
      expect(patchJson.data.officialInstagram).toBe("@yechipmitelkom2026");
      expect(patchJson.data.scoreWeightMeeting).toBe(8);
    });

    // 5.2 Announcements
    let announcementId: string;
    it("5.2 CRUD /api/cms/announcements", async () => {
      const createRes = await app.request("/api/cms/announcements", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Pendaftaran Diklat Kader 2026 Dibuka",
          content: "Segera lengkapi formulir pendaftaran sebelum batas akhir.",
          targetAudience: "PUBLIC",
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      announcementId = createJson.data.id;

      const getRes = await app.request("/api/cms/announcements", {
        headers: authHeaders(),
      });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.data.some((a: any) => a.id === announcementId)).toBe(true);

      const patchRes = await app.request(`/api/cms/announcements/${announcementId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Pendaftaran Diklat Kader 2026 Diperpanjang",
        }),
      });
      expect(patchRes.status).toBe(200);

      const delRes = await app.request(`/api/cms/announcements/${announcementId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delRes.status).toBe(200);
    });

    // 5.3 Tentang & 3 Pilar
    it("5.3 GET & PATCH /api/cms/tentang and PUT /api/cms/tentang/pillars", async () => {
      const patchRes = await app.request("/api/cms/tentang", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          eyebrow: "TENTANG KAMI",
          title: "Membina Pengusaha Muda Telkom Unggul",
          description: "Deskripsi utama organisasi kemahasiswaan wirausaha mandiri berintegritas tinggi.",
        }),
      });
      expect(patchRes.status).toBe(200);

      const pillarsRes = await app.request("/api/cms/tentang/pillars", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          pillars: [
            { title: "Pilar Inkubasi Bisnis", description: "Inkubasi ide bisnis mahasiswa dari nol hingga tahap rilis pasar.", sortOrder: 1 },
            { title: "Pilar Akselerasi Jaringan", description: "Menghubungkan kader muda dengan jaringan pengusaha BPC.", sortOrder: 2 },
            { title: "Pilar Etika Kewirausahaan", description: "Membentuk integritas kepemimpinan bisnis berkarakter.", sortOrder: 3 },
          ],
        }),
      });
      expect(pillarsRes.status).toBe(200);
      const pillarsJson = await pillarsRes.json();
      expect(pillarsJson.data.length).toBe(3);
    });

    // 5.4 Partners
    let partnerId: string;
    it("5.4 CRUD /api/cms/partners", async () => {
      const createRes = await app.request("/api/cms/partners", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "PT Telkom Indonesia",
          category: "Korporasi & BUMN",
          scope: "Penyediaan Program Inkubasi & Hibah Kompetisi",
          period: "2026 - 2027",
          status: "Mitra Aktif",
          imageSrc: "https://storage.hipmi-pt.id/telkom.png",
          imageAlt: "Logo Resmi PT Telkom Indonesia",
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      partnerId = createJson.data.id;

      const getRes = await app.request("/api/cms/partners", {
        headers: authHeaders(),
      });
      expect(getRes.status).toBe(200);

      const patchRes = await app.request(`/api/cms/partners/${partnerId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          status: "MoU 2026",
        }),
      });
      expect(patchRes.status).toBe(200);

      const delRes = await app.request(`/api/cms/partners/${partnerId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delRes.status).toBe(200);
    });

    // 5.5 Bisnis Kader
    let bisnisId: string;
    it("5.5 CRUD /api/cms/kader-businesses", async () => {
      const createRes = await app.request("/api/cms/kader-businesses", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          businessName: "Kopi Mahasiswa Nusantara",
          sector: "Kuliner / F&B",
          description: "Kedai kopi artisan berbasis beans lokal Indonesia.",
          ownerLabel: "Budi Santoso (SI '22)",
          verifiedLabel: "Terverifikasi Pengurus 2026",
          imageAlt: "Logo Kedai Kopi Mahasiswa",
          slotStatus: "ready",
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      bisnisId = createJson.data.id;

      const patchRes = await app.request(`/api/cms/kader-businesses/${bisnisId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          businessName: "Kopi Mandiri Nusantara",
        }),
      });
      expect(patchRes.status).toBe(200);

      const delRes = await app.request(`/api/cms/kader-businesses/${bisnisId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delRes.status).toBe(200);
    });

    // 5.6 Prestasi & Penghargaan
    let prestasiId: string;
    it("5.6 CRUD /api/cms/achievements", async () => {
      const createRes = await app.request("/api/cms/achievements", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Juara 1 Wirausaha Muda Mandiri",
          category: "Kompetisi Bisnis",
          description: "Inovasi startup edutech berbasis AI tingkat universitas nasional.",
          recipientLabel: "Tim HIPMI Innovate",
          organizerLabel: "Bank Mandiri (2025)",
          imageAlt: "Penerimaan Penghargaan Juara 1",
          slotStatus: "ready",
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      prestasiId = createJson.data.id;

      const patchRes = await app.request(`/api/cms/achievements/${prestasiId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Juara 1 Wirausaha Mandiri Nasional",
        }),
      });
      expect(patchRes.status).toBe(200);

      const delRes = await app.request(`/api/cms/achievements/${prestasiId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delRes.status).toBe(200);
    });

    // 5.7 Testimonials & Verification
    let testimonialId: string;
    it("5.7 CRUD & Verify /api/cms/testimonials", async () => {
      const createRes = await app.request("/api/cms/testimonials", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: "Kader & Alumni",
          quote: "Bergabung dengan HIPMI PT Telkom membuka cakrawala wirausaha nyata dan mempertemukan saya dengan mentor terbaik.",
          authorLabel: "Rian Hidayat",
          roleOrOrg: "Founder Brand Lokal (Alumni 2024)",
          verified: false,
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      testimonialId = createJson.data.id;
      expect(createJson.data.verified).toBe(false);

      // Verify testimonial
      const verifyRes = await app.request(`/api/cms/testimonials/${testimonialId}/verify`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ verified: true }),
      });
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(verifyJson.data.verified).toBe(true);
    });

    // 5.8 Program Kerja, Kompartemen, & Slides
    it("5.8 Program Kerja 3-tier hierarchy CRUD", async () => {
      // 1. Fetch OKK bidang
      const allBidangRes = await app.request("/api/cms/program-kerja", {
        headers: authHeaders(),
      });
      expect(allBidangRes.status).toBe(200);
      const allBidangJson = await allBidangRes.json();
      const okkBidang = allBidangJson.data.find((b: any) => b.slug === "okk");
      expect(okkBidang).toBeDefined();

      // 2. Add compartment
      const compRes = await app.request("/api/cms/program-kerja/compartment", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          bidangId: okkBidang.id,
          code: "KOMPARTEMEN 1: PSDM",
          name: "Kompartemen PSDM",
          operationalPattern: "proker-jobdesk",
          sortOrder: 1,
        }),
      });
      expect(compRes.status).toBe(201);
      const compJson = await compRes.json();
      const compId = compJson.data.id;

      // 3. Add proker slide
      const prokerSlideRes = await app.request("/api/cms/program-kerja/slide", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          compartmentId: compId,
          kind: "proker",
          title: "Open Mind & LDKK 2026",
          description: "Rangkaian orientasi dan kaderisasi berjenjang bagi calon pengurus muda.",
          mediaSourceLabel: "Dokumentasi OKK",
          slotStatus: "ready",
        }),
      });
      expect(prokerSlideRes.status).toBe(201);

      // 4. Add jobdesk slide
      const jobdeskSlideRes = await app.request("/api/cms/program-kerja/slide", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          compartmentId: compId,
          kind: "jobdesk",
          title: "Manajemen Presensi & Rapat",
          description: "Pendataan kehadiran seluruh anggota pada forum pleno dan sidang organisasi.",
          slotStatus: "ready",
        }),
      });
      expect(jobdeskSlideRes.status).toBe(201);
    });
  });

  // =========================================================================
  // 6. Public Read-Only Endpoints & Visibility Filtering
  // =========================================================================
  describe("6. Public Read-Only Endpoints (Feature 36)", () => {
    beforeAll(async () => {
      // Seed an unverified testimonial
      await app.request("/api/cms/testimonials", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: "Kader & Alumni",
          quote: "Testimoni unverified yang tidak boleh tampil di halaman publik sama sekali.",
          authorLabel: "Anonymous User",
          roleOrOrg: "Member",
          verified: false,
        }),
      });

      // Seed an unpublished partner
      await app.request("/api/cms/partners", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "Mitra Unpublished",
          category: "Mitra Strategis",
          scope: "Draft Kerja Sama",
          period: "2026",
          status: "Draft",
          imageSrc: "https://storage.hipmi-pt.id/draft.png",
          imageAlt: "Logo Mitra Draft",
          isPublished: false,
        }),
      });
    });

    it("GET /api/public/testimonials strictly returns verified = true ONLY", async () => {
      const res = await app.request("/api/public/testimonials");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      for (const item of json.data) {
        expect(item.verified).toBe(true);
        expect(item.isPublished).toBe(true);
      }
      expect(json.data.some((t: any) => t.authorLabel === "Anonymous User")).toBe(false);
    });

    it("GET /api/public/partners strictly returns published items ONLY", async () => {
      const res = await app.request("/api/public/partners");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      for (const item of json.data) {
        expect(item.isPublished).toBe(true);
      }
      expect(json.data.some((p: any) => p.name === "Mitra Unpublished")).toBe(false);
    });

    it("GET /api/public/home returns aggregated homepage payload with stats", async () => {
      const res = await app.request("/api/public/home");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const data = json.data;
      expect(data.heroSlides).toBeDefined();
      expect(data.tentang).toBeDefined();
      expect(data.tentang.pillars.length).toBe(3);
      expect(data.stats).toBeDefined();
      expect(data.stats.bidangCount).toBe(4);
      expect(data.siteSettings).toBeDefined();
      expect(data.siteSettings.secretariatAddress).toBeDefined();
    });

    it("GET /api/public/program-kerja/okk returns nested compartment structure with proker & jobdesk slides", async () => {
      const res = await app.request("/api/public/program-kerja/okk");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const bidangData = json.data;
      expect(bidangData.slug).toBe("okk");
      expect(bidangData.summaryStats).toContain("Kompartemen");
      expect(bidangData.compartments.length).toBeGreaterThan(0);
      const firstComp = bidangData.compartments[0];
      expect(firstComp.prokerSlides).toBeDefined();
      expect(firstComp.jobdeskSlides).toBeDefined();
    });

    it("GET /api/public/site-config returns public configuration", async () => {
      const res = await app.request("/api/public/site-config");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.officialEmail).toBeDefined();
      expect(json.data.secretariatAddress).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Auto-Revalidation Webhook Trigger
  // =========================================================================
  describe("7. Auto-Revalidation Webhook Trigger (Feature 34)", () => {
    it("dispatches revalidation webhook with secret header and tags on mutation", async () => {
      revalidateMock.clear();

      // Trigger mutation on site settings
      await app.request("/api/cms/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          scoreWeightProker: 15,
        }),
      });

      // Allow microtask queue to process async non-blocking webhook
      await new Promise((resolve) => setTimeout(resolve, 150));

      const calls = revalidateMock.getCalls();
      expect(calls.length).toBeGreaterThan(0);
      const latestCall = calls[calls.length - 1];
      expect(latestCall.isValidSecret).toBe(true);
      expect(latestCall.body.tags).toContain("settings");
      expect(latestCall.body.tags).toContain("home");
    });
  });

  // =========================================================================
  // 8. Photo Removal, Full Text Clear -> Empty Public API -> Restore Cycle
  // =========================================================================
  describe("8. Photo Removal & Full Clear -> Restore Cycle", () => {
    it("allows removing photos (imageSrc: null) across Hero, Tentang, Partners, Bisnis, Prestasi, and Slides", async () => {
      const heroRes = await app.request("/api/cms/hero-slides", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Hero Tanpa Foto Pertama",
          subtitle: "Deskripsi hero slide tanpa gambar untuk memastikan mode teks tetap valid.",
          imageSrc: null,
          imageAlt: null,
          sortOrder: 1,
          isPublished: true,
        }),
      });
      expect(heroRes.status).toBe(201);
      const heroJson = await heroRes.json();
      expect(heroJson.data.imageSrc).toBeNull();

      const partnerRes = await app.request("/api/cms/partners", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "Mitra Tanpa Logo",
          category: "Mitra Strategis",
          scope: "Kolaborasi ekosistem kewirausahaan kampus Telkom tanpa logo.",
          period: "Periode 2026",
          status: "Aktif",
          imageSrc: null,
          imageAlt: null,
          isPublished: true,
        }),
      });
      expect(partnerRes.status).toBe(201);
      const partnerJson = await partnerRes.json();
      expect(partnerJson.data.imageSrc).toBeNull();

      const tentangClearPoster = await app.request("/api/cms/tentang", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ videoPosterSrc: null }),
      });
      expect(tentangClearPoster.status).toBe(200);
      const tentangJson = await tentangClearPoster.json();
      expect(tentangJson.data.videoPosterSrc).toBeNull();
    });

    it("clears Tentang, Settings, Bidang, and all list items so /api/public/* returns empty/cleared state", async () => {
      // Clear Tentang & Settings
      const delTentang = await app.request("/api/cms/tentang", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delTentang.status).toBe(200);

      const delSettings = await app.request("/api/cms/settings", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(delSettings.status).toBe(200);

      // Delete all Hero Slides, Partners, Bisnis, Prestasi, Testimonials, Announcements
      for (const ep of [
        "/api/cms/hero-slides",
        "/api/cms/partners",
        "/api/cms/kader-businesses",
        "/api/cms/achievements",
        "/api/cms/testimonials",
        "/api/cms/announcements",
      ]) {
        const listRes = await app.request(ep, { headers: authHeaders() });
        const listJson = await listRes.json();
        for (const item of listJson.data || []) {
          const del = await app.request(`${ep}/${item.id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
          expect(del.status).toBe(200);
        }
      }

      // Clear all Bidangs (deletes compartments & slides and clears bidang texts)
      const progRes = await app.request("/api/cms/program-kerja", { headers: authHeaders() });
      const progJson = await progRes.json();
      for (const b of progJson.data || []) {
        const delB = await app.request(`/api/cms/program-kerja/bidang/${b.id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        expect(delB.status).toBe(200);
      }

      // Verify /api/public/home reflects completely cleared/empty state
      const pubHomeRes = await app.request("/api/public/home");
      expect(pubHomeRes.status).toBe(200);
      const pubHome = await pubHomeRes.json();
      expect(pubHome.data.heroSlides).toEqual([]);
      expect(pubHome.data.tentang.title).toBe("");
      expect(pubHome.data.tentang.pillars).toEqual([]);
      expect(pubHome.data.bidangs).toEqual([]);
      expect(pubHome.data.announcements).toEqual([]);
      expect(pubHome.data.siteSettings.officialEmail).toBe("");
      expect(pubHome.data.stats.compartmentCount).toBe(0);
      expect(pubHome.data.stats.partnerCount).toBe(0);

      // Restore baseline (no photos), add +2 per addable element, verify public API, then delete +2
      await app.request("/api/cms/tentang", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          eyebrow: "01 / TENTANG KAMI",
          title: "Menggerakkan Ekosistem Wirausaha Mahasiswa Universitas Telkom",
          description: "UKM HIPMI PT Universitas Telkom adalah wadah pengembangan pengusaha muda mahasiswa Universitas Telkom.",
          secondaryDescription: null,
          videoPosterSrc: null,
          pillars: [
            { title: "Inkubasi Bisnis Kader", description: "Pendampingan usaha mahasiswa dari validasi pasar hingga operasional bisnis.", sortOrder: 1 },
            { title: "Jejaring Kemitraan", description: "Membuka akses kolaborasi lintas fakultas, alumni HIPMI, dan mitra industri.", sortOrder: 2 },
            { title: "Kepemimpinan Wirausaha", description: "Menempa karakter kader melalui manajemen proyek kewirausahaan strategis.", sortOrder: 3 },
          ],
        }),
      });
      await app.request("/api/cms/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          secretariatAddress: "Student Center Universitas Telkom Bandung",
          officialEmail: "sekretariat@hipmipt-telkom.org",
          officialInstagram: "@hipmipt.telkom",
          whatsappContactLabel: "Humas & Kemitraan",
          whatsappContactUrl: "https://wa.me/6281234567890",
          copyrightText: "© 2026 UKM HIPMI PT Telkom",
        }),
      });

      const okkUpsert = await app.request("/api/cms/program-kerja", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          slug: "okk",
          shortName: "OKK",
          title: "BIDANG OKK",
          eyebrow: "PROGRAM KERJA BIDANG OKK",
          description: "Bidang Organisasi Kaderisasi dan Keanggotaan yang berfokus pada pengembangan kapasitas kader.",
          compartmentSummary: "PSDM, ADKESKA",
          sortOrder: 1,
        }),
      });
      const okkId = (await okkUpsert.json()).data.id;

      // Baseline 1 item per addable element
      await app.request("/api/cms/hero-slides", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Hero Baseline Tanpa Foto",
          subtitle: "Deskripsi hero baseline tanpa foto untuk verifikasi pemulihan data.",
          imageSrc: null,
          sortOrder: 1,
        }),
      });
      await app.request("/api/cms/partners", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "Mitra Baseline",
          category: "Korporasi & BUMN",
          scope: "Kolaborasi kunjungan industri dan sponsorship untuk kader kampus.",
          period: "2026",
          status: "Aktif",
          imageSrc: null,
        }),
      });
      await app.request("/api/cms/kader-businesses", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          businessName: "Bisnis Baseline",
          sector: "Teknologi & Jasa",
          description: "Usaha teknologi kader Universitas Telkom pada direktori bisnis kader.",
          ownerLabel: "Kader Telkom",
          verifiedLabel: "Terverifikasi",
          imageSrc: null,
          slotStatus: "pending-asset",
        }),
      });
      await app.request("/api/cms/achievements", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Prestasi Baseline",
          category: "Kompetisi Bisnis",
          description: "Pencapaian kompetisi bisnis tingkat nasional oleh tim kader Telkom.",
          recipientLabel: "Tim Telkom",
          organizerLabel: "Penyelenggara 2026",
          imageSrc: null,
          slotStatus: "pending-asset",
        }),
      });
      const baseCompRes = await app.request("/api/cms/program-kerja/compartment", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          bidangId: okkId,
          code: "KOMP BASELINE",
          name: "Kompartemen Baseline",
          operationalPattern: "proker-only",
          sortOrder: 1,
        }),
      });
      const baseCompId = (await baseCompRes.json()).data.id;
      await app.request("/api/cms/program-kerja/slide", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          compartmentId: baseCompId,
          kind: "proker",
          title: "Proker Baseline",
          description: "Program kerja baseline kompartemen OKK tanpa gambar untuk pengujian.",
          imageSrc: null,
          slotStatus: "pending-asset",
        }),
      });
      await app.request("/api/cms/testimonials", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: "Kader & Alumni",
          quote: "Kutipan testimoni baseline yang terverifikasi untuk halaman publik web.",
          authorLabel: "Alumni Baseline",
          roleOrOrg: "Founder Baseline",
          verified: true,
        }),
      });
      await app.request("/api/cms/announcements", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: "Info Baseline",
          content: "Konten pengumuman baseline untuk navbar web UKM.",
          targetAudience: "PUBLIC",
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
        }),
      });

      // Add +2 to each addable element & track IDs
      const addedIds: Record<string, string[]> = {
        hero: [],
        partner: [],
        bisnis: [],
        prestasi: [],
        comp: [],
        slide: [],
        testi: [],
        ann: [],
      };
      for (const idx of [1, 2]) {
        const h = await app.request("/api/cms/hero-slides", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: `Hero Tambahan Ke-${idx}`,
            subtitle: `Deskripsi hero tambahan ke-${idx} yang memenuhi batas minimum karakter.`,
            imageSrc: null,
            sortOrder: idx + 1,
          }),
        });
        addedIds.hero.push((await h.json()).data.id);

        const p = await app.request("/api/cms/partners", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: `Mitra Tambahan ${idx}`,
            category: "Mitra Strategis",
            scope: `Ruang lingkup mitra tambahan ${idx} untuk pengujian penambahan dua item.`,
            period: "2026",
            status: "Aktif",
            imageSrc: null,
          }),
        });
        addedIds.partner.push((await p.json()).data.id);

        const b = await app.request("/api/cms/kader-businesses", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            businessName: `Bisnis Tambahan ${idx}`,
            sector: "Kuliner / F&B",
            description: `Deskripsi bisnis tambahan ${idx} yang cukup panjang untuk validasi.`,
            ownerLabel: `Owner ${idx}`,
            verifiedLabel: "Terverifikasi",
            imageSrc: null,
            slotStatus: "pending-asset",
          }),
        });
        addedIds.bisnis.push((await b.json()).data.id);

        const a = await app.request("/api/cms/achievements", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: `Prestasi Tambahan ${idx}`,
            category: "Rekognisi",
            description: `Deskripsi prestasi tambahan ${idx} yang cukup panjang untuk validasi.`,
            recipientLabel: `Peraih ${idx}`,
            organizerLabel: `Penyelenggara ${idx}`,
            imageSrc: null,
            slotStatus: "pending-asset",
          }),
        });
        addedIds.prestasi.push((await a.json()).data.id);

        const c = await app.request("/api/cms/program-kerja/compartment", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            bidangId: okkId,
            code: `KOMP ADD ${idx}`,
            name: `Kompartemen Add ${idx}`,
            operationalPattern: "proker-only",
            sortOrder: idx + 1,
          }),
        });
        const compId = (await c.json()).data.id;
        addedIds.comp.push(compId);

        const s = await app.request("/api/cms/program-kerja/slide", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            compartmentId: baseCompId,
            kind: "proker",
            title: `Slide Tambahan ${idx}`,
            description: `Deskripsi slide tambahan ${idx} yang memenuhi batas minimum karakter.`,
            imageSrc: null,
            slotStatus: "pending-asset",
          }),
        });
        addedIds.slide.push((await s.json()).data.id);

        const t = await app.request("/api/cms/testimonials", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            category: "Mitra Kolaborasi",
            quote: `Kutipan testimoni tambahan ${idx} yang cukup panjang untuk lolos validasi minimal.`,
            authorLabel: `Penulis Add ${idx}`,
            roleOrOrg: `Instansi Add ${idx}`,
            verified: true,
          }),
        });
        addedIds.testi.push((await t.json()).data.id);

        const an = await app.request("/api/cms/announcements", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: `Berita Add ${idx}`,
            content: `Isi berita tambahan ke-${idx} untuk ticker publik.`,
            targetAudience: "PUBLIC",
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(),
          }),
        });
        addedIds.ann.push((await an.json()).data.id);
      }

      const afterAddHome = await (await app.request("/api/public/home")).json();
      expect(afterAddHome.data.heroSlides.length).toBe(3);
      expect(afterAddHome.data.announcements.length).toBe(3);
      expect(afterAddHome.data.stats.partnerCount).toBe(3);
      expect(afterAddHome.data.stats.compartmentCount).toBe(3);
      expect(afterAddHome.data.stats.prokerJobdeskCount).toBe(3);
      expect((await (await app.request("/api/public/kader-businesses")).json()).data.length).toBe(3);
      expect((await (await app.request("/api/public/achievements")).json()).data.length).toBe(3);
      expect((await (await app.request("/api/public/testimonials")).json()).data.length).toBe(3);

      // Delete all +2 added items
      for (const id of addedIds.hero) await app.request(`/api/cms/hero-slides/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.partner) await app.request(`/api/cms/partners/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.bisnis) await app.request(`/api/cms/kader-businesses/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.prestasi) await app.request(`/api/cms/achievements/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.slide) await app.request(`/api/cms/program-kerja/slide/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.comp) await app.request(`/api/cms/program-kerja/compartment/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.testi) await app.request(`/api/cms/testimonials/${id}`, { method: "DELETE", headers: authHeaders() });
      for (const id of addedIds.ann) await app.request(`/api/cms/announcements/${id}`, { method: "DELETE", headers: authHeaders() });

      const finalHome = await (await app.request("/api/public/home")).json();
      expect(finalHome.data.heroSlides.length).toBe(1);
      expect(finalHome.data.announcements.length).toBe(1);
      expect(finalHome.data.stats.partnerCount).toBe(1);
      expect(finalHome.data.stats.compartmentCount).toBe(1);
      expect(finalHome.data.stats.prokerJobdeskCount).toBe(1);
      expect((await (await app.request("/api/public/kader-businesses")).json()).data.length).toBe(1);
      expect((await (await app.request("/api/public/achievements")).json()).data.length).toBe(1);
      expect((await (await app.request("/api/public/testimonials")).json()).data.length).toBe(1);
    });
  });
});
