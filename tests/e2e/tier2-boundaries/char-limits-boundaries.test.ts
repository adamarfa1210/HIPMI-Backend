import { describe, it, expect, beforeAll } from '../../helpers/test-runner.js';
import { app } from '../../../src/app.js';
import { ensureTier2Initialized, getTier2AuthHeaders } from './tier2-setup.js';

await ensureTier2Initialized();

describe('Tier 2: CMS Character Limits & Anti-Slop Validation Suite', () => {
  const adminHeaders = getTier2AuthHeaders('admin');

  const sendPost = async (path: string, payload: any) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...adminHeaders,
      },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    let json: any = {};
    try {
      json = await res.json();
    } catch {}
    return { status, json };
  };

  const sendPut = async (path: string, payload: any) => {
    const res = await app.request(path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...adminHeaders,
      },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    let json: any = {};
    try {
      json = await res.json();
    } catch {}
    return { status, json };
  };

  // Helper string generator of exact length
  const str = (len: number, char: string = 'a') => char.repeat(len);

  // =========================================================================
  // 1. Hero Slide Boundaries (BACKEND-REQUIREMENTS.md §3.1)
  // =========================================================================
  describe('1. Hero Slide Character Ceilings & Floors', () => {
    const baseHero = () => ({
      title: 'Membangun Generasi Muda ' + str(21), // 45 chars
      subtitle: 'Membentuk wirausahawan masa depan kampus Telkom University bersama HIPMI PT dengan jaringan luas ' + str(82), // 180 chars
      imageSrc: 'https://cdn.hipmi.org/assets/hero-slide-main.webp',
      imageAlt: 'Dokumentasi kegiatan pelantikan pengurus HIPMI PT Telkom University periode 2026 ' + str(57), // 140 chars
      indexLabel: '01 / 05',
    });

    it('1.1 accepts title at exact ceiling of 45 characters', async () => {
      const payload = baseHero();
      payload.title = str(45);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.2 rejects title exceeding ceiling with 46 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.title = str(46);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('title');
    });

    it('1.3 accepts title at exact floor of 10 characters', async () => {
      const payload = baseHero();
      payload.title = str(10);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.4 rejects title below floor with 9 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.title = str(9);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('1.5 accepts subtitle at exact ceiling of 180 characters', async () => {
      const payload = baseHero();
      payload.subtitle = str(180);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.6 rejects subtitle exceeding ceiling with 181 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.subtitle = str(181);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('subtitle');
    });

    it('1.7 accepts subtitle at exact floor of 40 characters', async () => {
      const payload = baseHero();
      payload.subtitle = str(40);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.8 rejects subtitle below floor with 39 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.subtitle = str(39);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('1.9 accepts imageAlt at exact ceiling of 140 characters', async () => {
      const payload = baseHero();
      payload.imageAlt = str(140);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.10 rejects imageAlt exceeding ceiling with 141 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.imageAlt = str(141);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('imageAlt');
    });

    it('1.11 accepts indexLabel at exact ceiling of 10 characters', async () => {
      const payload = baseHero();
      payload.indexLabel = str(10);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('1.12 rejects indexLabel exceeding ceiling with 11 characters (HTTP 400)', async () => {
      const payload = baseHero();
      payload.indexLabel = str(11);
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. Tentang & 3 Pilar Boundaries (BACKEND-REQUIREMENTS.md §3.2)
  // =========================================================================
  describe('2. Tentang & 3 Pilar Character & Array Boundaries', () => {
    const basePillars = () => [
      { title: str(20), description: str(80) },
      { title: str(25), description: str(90) },
      { title: str(30), description: str(100) },
    ];

    const baseTentang = () => ({
      eyebrow: str(25),
      title: str(60),
      description: str(200),
      secondaryDescription: str(150),
      pillars: basePillars(),
    });

    it('2.1 accepts eyebrow at exact ceiling of 30 characters', async () => {
      const payload = baseTentang();
      payload.eyebrow = str(30);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.2 rejects eyebrow exceeding ceiling with 31 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.eyebrow = str(31);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('eyebrow');
    });

    it('2.3 accepts title at exact ceiling of 70 characters', async () => {
      const payload = baseTentang();
      payload.title = str(70);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.4 rejects title exceeding ceiling with 71 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.title = str(71);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('title');
    });

    it('2.5 accepts description at exact ceiling of 320 characters', async () => {
      const payload = baseTentang();
      payload.description = str(320);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.6 rejects description exceeding ceiling with 321 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.description = str(321);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('description');
    });

    it('2.7 accepts secondaryDescription at exact ceiling of 280 characters', async () => {
      const payload = baseTentang();
      payload.secondaryDescription = str(280);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.8 rejects secondaryDescription exceeding ceiling with 281 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.secondaryDescription = str(281);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('2.9 accepts exactly 3 active pillars', async () => {
      const payload = baseTentang();
      expect(payload.pillars.length).toBe(3);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.10 rejects pillars array with 2 items (below exact requirement of 3, HTTP 400)', async () => {
      const payload = baseTentang();
      payload.pillars = payload.pillars.slice(0, 2);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('3 pilar');
    });

    it('2.11 rejects pillars array with 4 items (exceeding exact requirement of 3, HTTP 400)', async () => {
      const payload = baseTentang();
      payload.pillars.push({ title: str(20), description: str(80) });
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('3 pilar');
    });

    it('2.12 accepts pillar.title at exact ceiling of 32 characters', async () => {
      const payload = baseTentang();
      payload.pillars[0].title = str(32);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.13 rejects pillar.title exceeding ceiling with 33 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.pillars[0].title = str(33);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('2.14 accepts pillar.description at exact ceiling of 120 characters', async () => {
      const payload = baseTentang();
      payload.pillars[0].description = str(120);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('2.15 rejects pillar.description exceeding ceiling with 121 characters (HTTP 400)', async () => {
      const payload = baseTentang();
      payload.pillars[0].description = str(121);
      const { status, json } = await sendPost('/api/cms/tentang', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. Partner / Mitra Boundaries (BACKEND-REQUIREMENTS.md §3.3)
  // =========================================================================
  describe('3. Partner / Mitra Character & Enum Boundaries', () => {
    const basePartner = () => ({
      name: str(30),
      category: 'Mitra Strategis',
      scope: str(120),
      period: '2025 - 2027',
      status: 'Mitra Aktif',
      imageAlt: str(80),
      logoUrl: 'https://cdn.hipmi.org/partner.png',
    });

    it('3.1 accepts name at exact ceiling of 35 characters', async () => {
      const payload = basePartner();
      payload.name = str(35);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('3.2 rejects name exceeding ceiling with 36 characters (HTTP 400)', async () => {
      const payload = basePartner();
      payload.name = str(36);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('name');
    });

    it('3.3 accepts scope at exact ceiling of 160 characters', async () => {
      const payload = basePartner();
      payload.scope = str(160);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('3.4 rejects scope exceeding ceiling with 161 characters (HTTP 400)', async () => {
      const payload = basePartner();
      payload.scope = str(161);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('scope');
    });

    it('3.5 accepts period at exact ceiling of 60 characters', async () => {
      const payload = basePartner();
      payload.period = str(60);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('3.6 rejects period exceeding ceiling with 61 characters (HTTP 400)', async () => {
      const payload = basePartner();
      payload.period = str(61);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('3.7 accepts status at exact ceiling of 30 characters', async () => {
      const payload = basePartner();
      payload.status = str(30);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('3.8 rejects status exceeding ceiling with 31 characters (HTTP 400)', async () => {
      const payload = basePartner();
      payload.status = str(31);
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('3.9 rejects unlisted partner category enum (HTTP 400)', async () => {
      const payload = basePartner();
      payload.category = 'Kategori Acak Tidak Terdaftar';
      const { status, json } = await sendPost('/api/cms/partners', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('kategori');
    });
  });

  // =========================================================================
  // 4. Bisnis Kader Boundaries (BACKEND-REQUIREMENTS.md §3.4)
  // =========================================================================
  describe('4. Bisnis Kader Character & Sector Boundaries', () => {
    const baseBisnis = () => ({
      businessName: str(40),
      sector: 'Teknologi & Jasa',
      description: str(150),
      ownerLabel: 'Ahmad Faiz (Informatika 2022)',
      verifiedLabel: 'Terverifikasi Pengurus 2026',
      imageAlt: str(80),
      imageUrl: 'https://cdn.hipmi.org/bisnis.png',
    });

    it('4.1 accepts businessName at exact ceiling of 45 characters', async () => {
      const payload = baseBisnis();
      payload.businessName = str(45);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('4.2 rejects businessName exceeding ceiling with 46 characters (HTTP 400)', async () => {
      const payload = baseBisnis();
      payload.businessName = str(46);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('businessName');
    });

    it('4.3 accepts description at exact ceiling of 180 characters', async () => {
      const payload = baseBisnis();
      payload.description = str(180);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('4.4 rejects description exceeding ceiling with 181 characters (HTTP 400)', async () => {
      const payload = baseBisnis();
      payload.description = str(181);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('description');
    });

    it('4.5 accepts ownerLabel at exact ceiling of 45 characters', async () => {
      const payload = baseBisnis();
      payload.ownerLabel = str(45);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('4.6 rejects ownerLabel exceeding ceiling with 46 characters (HTTP 400)', async () => {
      const payload = baseBisnis();
      payload.ownerLabel = str(46);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('4.7 accepts verifiedLabel at exact ceiling of 40 characters', async () => {
      const payload = baseBisnis();
      payload.verifiedLabel = str(40);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('4.8 rejects verifiedLabel exceeding ceiling with 41 characters (HTTP 400)', async () => {
      const payload = baseBisnis();
      payload.verifiedLabel = str(41);
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('4.9 rejects invalid sector enum (HTTP 400)', async () => {
      const payload = baseBisnis();
      payload.sector = 'Sektor Ilegal';
      const { status, json } = await sendPost('/api/cms/bisnis-kader', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('sektor');
    });
  });

  // =========================================================================
  // 5. Prestasi & Penghargaan Boundaries (BACKEND-REQUIREMENTS.md §3.5)
  // =========================================================================
  describe('5. Prestasi & Penghargaan Character & Category Boundaries', () => {
    const basePrestasi = () => ({
      title: str(40),
      category: 'Kompetisi Bisnis',
      description: str(150),
      recipientLabel: 'Tim Telkom Startup Innovator',
      organizerLabel: 'Kemendikbudristek RI (2025)',
      imageAlt: str(80),
      imageUrl: 'https://cdn.hipmi.org/prestasi.png',
    });

    it('5.1 accepts title at exact ceiling of 55 characters', async () => {
      const payload = basePrestasi();
      payload.title = str(55);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('5.2 rejects title exceeding ceiling with 56 characters (HTTP 400)', async () => {
      const payload = basePrestasi();
      payload.title = str(56);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('title');
    });

    it('5.3 accepts description at exact ceiling of 180 characters', async () => {
      const payload = basePrestasi();
      payload.description = str(180);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('5.4 rejects description exceeding ceiling with 181 characters (HTTP 400)', async () => {
      const payload = basePrestasi();
      payload.description = str(181);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('description');
    });

    it('5.5 accepts recipientLabel at exact ceiling of 50 characters', async () => {
      const payload = basePrestasi();
      payload.recipientLabel = str(50);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('5.6 rejects recipientLabel exceeding ceiling with 51 characters (HTTP 400)', async () => {
      const payload = basePrestasi();
      payload.recipientLabel = str(51);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('5.7 accepts organizerLabel at exact ceiling of 55 characters', async () => {
      const payload = basePrestasi();
      payload.organizerLabel = str(55);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('5.8 rejects organizerLabel exceeding ceiling with 56 characters (HTTP 400)', async () => {
      const payload = basePrestasi();
      payload.organizerLabel = str(56);
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('5.9 rejects invalid prestasi category enum (HTTP 400)', async () => {
      const payload = basePrestasi();
      payload.category = 'Kategori Juara Palsu';
      const { status, json } = await sendPost('/api/cms/prestasi', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 6. Testimoni Boundaries (BACKEND-REQUIREMENTS.md §3.7)
  // =========================================================================
  describe('6. Testimoni Character & Boolean Verification Boundaries', () => {
    const baseTesti = () => ({
      category: 'Kader & Alumni',
      quote: str(160),
      authorLabel: 'Rian Pratama (Ketua HIPMI PT 2024)',
      roleOrOrg: 'CEO & Founder PT Inovasi Digital Nusantara',
      verified: true,
    });

    it('6.1 accepts quote at exact ceiling of 240 characters', async () => {
      const payload = baseTesti();
      payload.quote = str(240);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('6.2 rejects quote exceeding ceiling with 241 characters (HTTP 400)', async () => {
      const payload = baseTesti();
      payload.quote = str(241);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('quote');
    });

    it('6.3 accepts authorLabel at exact ceiling of 40 characters', async () => {
      const payload = baseTesti();
      payload.authorLabel = str(40);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('6.4 rejects authorLabel exceeding ceiling with 41 characters (HTTP 400)', async () => {
      const payload = baseTesti();
      payload.authorLabel = str(41);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('authorLabel');
    });

    it('6.5 accepts roleOrOrg at exact ceiling of 55 characters', async () => {
      const payload = baseTesti();
      payload.roleOrOrg = str(55);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('6.6 rejects roleOrOrg exceeding ceiling with 56 characters (HTTP 400)', async () => {
      const payload = baseTesti();
      payload.roleOrOrg = str(56);
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('6.7 rejects non-boolean verified field (e.g. string "yes", HTTP 400)', async () => {
      const payload = baseTesti();
      (payload as any).verified = 'yes';
      const { status, json } = await sendPost('/api/cms/testimonials', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 7. Program Kerja & Slide Boundaries (BACKEND-REQUIREMENTS.md §3.6)
  // =========================================================================
  describe('7. Program Kerja & Slide Character Boundaries', () => {
    it('7.1 accepts bidang shortName at exact ceiling of 15 characters', async () => {
      const payload = {
        slug: 'okk',
        shortName: str(15),
        title: str(20),
        eyebrow: str(30),
        description: str(180),
        compartmentSummary: str(40),
      };
      const { status, json } = await sendPost('/api/cms/program-kerja', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('7.2 rejects bidang shortName exceeding ceiling with 16 characters (HTTP 400)', async () => {
      const payload = {
        slug: 'okk',
        shortName: str(16),
        title: str(20),
        eyebrow: str(30),
        description: str(180),
        compartmentSummary: str(40),
      };
      const { status, json } = await sendPost('/api/cms/program-kerja', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('7.3 accepts bidang title at exact ceiling of 25 characters', async () => {
      const payload = {
        slug: 'okk',
        shortName: str(10),
        title: str(25),
        eyebrow: str(30),
        description: str(180),
        compartmentSummary: str(40),
      };
      const { status, json } = await sendPost('/api/cms/program-kerja', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('7.4 rejects bidang title exceeding ceiling with 26 characters (HTTP 400)', async () => {
      const payload = {
        slug: 'okk',
        shortName: str(10),
        title: str(26),
        eyebrow: str(30),
        description: str(180),
        compartmentSummary: str(40),
      };
      const { status, json } = await sendPost('/api/cms/program-kerja', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('7.5 accepts program slide title at exact ceiling of 45 characters', async () => {
      const payload = {
        kind: 'proker',
        title: str(45),
        description: str(150),
        imageAlt: str(50),
      };
      const { status, json } = await sendPost('/api/cms/program-slides', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('7.6 rejects program slide title exceeding ceiling with 46 characters (HTTP 400)', async () => {
      const payload = {
        kind: 'proker',
        title: str(46),
        description: str(150),
        imageAlt: str(50),
      };
      const { status, json } = await sendPost('/api/cms/program-slides', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('7.7 accepts program slide description at exact ceiling of 200 characters', async () => {
      const payload = {
        kind: 'jobdesk',
        title: str(30),
        description: str(200),
        imageAlt: str(50),
      };
      const { status, json } = await sendPost('/api/cms/program-slides', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
    });

    it('7.8 rejects program slide description exceeding ceiling with 201 characters (HTTP 400)', async () => {
      const payload = {
        kind: 'jobdesk',
        title: str(30),
        description: str(201),
        imageAlt: str(50),
      };
      const { status, json } = await sendPost('/api/cms/program-slides', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 8. Site Settings Boundaries (BACKEND-REQUIREMENTS.md §4)
  // =========================================================================
  describe('8. Site Settings Character & Format Boundaries', () => {
    const baseSettings = () => ({
      secretariatAddress: str(120),
      officialEmail: 'sekretariat@hipmi-pt.telkomuniversity.ac.id',
      officialInstagram: 'yechipmitelkom',
      whatsappContactLabel: '081234567890 (Humas & Kerjasama)',
      copyrightText: '© 2026 HIPMI PT Telkom University. All rights reserved.',
    });

    it('8.1 accepts secretariatAddress at exact ceiling of 150 characters', async () => {
      const payload = baseSettings();
      payload.secretariatAddress = str(150);
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('8.2 rejects secretariatAddress exceeding ceiling with 151 characters (HTTP 400)', async () => {
      const payload = baseSettings();
      payload.secretariatAddress = str(151);
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('secretariatAddress');
    });

    it('8.3 accepts valid officialEmail up to 80 characters', async () => {
      const payload = baseSettings();
      payload.officialEmail = 'contact@' + str(64) + '.com'; // 72 chars
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('8.4 rejects officialEmail exceeding ceiling of 80 characters (HTTP 400)', async () => {
      const payload = baseSettings();
      payload.officialEmail = 'verylongemailname' + str(60) + '@telkom.ac.id'; // > 80 chars
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('officialEmail');
    });

    it('8.5 rejects malformed officialEmail without @ or domain (HTTP 400)', async () => {
      const payload = baseSettings();
      payload.officialEmail = 'not-a-valid-email-format';
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('8.6 accepts copyrightText at exact ceiling of 80 characters', async () => {
      const payload = baseSettings();
      payload.copyrightText = str(80);
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('8.7 rejects copyrightText exceeding ceiling with 81 characters (HTTP 400)', async () => {
      const payload = baseSettings();
      payload.copyrightText = str(81);
      const { status, json } = await sendPut('/api/cms/site-settings', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 9. Plain-Text Sanitization & Anti-Slop (BACKEND-REQUIREMENTS.md §1)
  // =========================================================================
  describe('9. Plain-Text Sanitization & Anti-Slop Rules', () => {
    it('9.1 rejects text containing bullet symbol • (HTTP 400)', async () => {
      const payload = {
        title: 'Pengurus • HIPMI PT Telkom', // contains •
        subtitle: 'Membentuk wirausahawan masa depan kampus Telkom University bersama HIPMI PT ' + str(80),
        imageSrc: 'https://cdn.hipmi.org/hero.webp',
        imageAlt: 'Foto pengurus pelantikan akbar ' + str(60),
      };
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('dekoratif');
    });

    it('9.2 rejects text containing bullet symbol ● (HTTP 400)', async () => {
      const payload = {
        title: 'Pengurus ● HIPMI PT Telkom', // contains ●
        subtitle: 'Membentuk wirausahawan masa depan kampus Telkom University bersama HIPMI PT ' + str(80),
        imageSrc: 'https://cdn.hipmi.org/hero.webp',
        imageAlt: 'Foto pengurus pelantikan akbar ' + str(60),
      };
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('dekoratif');
    });

    it('9.3 strips HTML tags and normalizes em dashes gracefully', async () => {
      const payload = {
        title: '<b>HIPMI</b> PT — Telkom', // contains <b> tags and em dash —
        subtitle: 'Membentuk wirausahawan masa depan kampus Telkom University bersama HIPMI PT ' + str(80),
        imageSrc: 'https://cdn.hipmi.org/hero.webp',
        imageAlt: 'Foto pengurus pelantikan akbar ' + str(60),
      };
      const { status, json } = await sendPost('/api/cms/hero', payload);
      expect(status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('HIPMI PT - Telkom');
    });
  });
});
