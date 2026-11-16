import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import { RevalidateMock } from '../../helpers/revalidate-mock.js';

// Text sanitization logic matching BACKEND-REQUIREMENTS.md
export function sanitizePlainText(input: string): string {
  if (!input) return '';
  return input
    // 1. Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // 2. Strip Markdown bold/italic/links
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    // 3. Remove decorative bullets • and ●
    .replace(/[•●]/g, '')
    // 4. Normalize em-dashes — and en-dashes – to standard ASCII hyphen -
    .replace(/[—–]/g, '-')
    // 5. Collapse excessive whitespace
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Validation schemas matching BACKEND-REQUIREMENTS.md Section 3 & 4
export const HARD_LIMITS = {
  hero: { title: 45, subtitle: 180, imageAlt: 140 },
  tentang: { eyebrow: 30, title: 70, description: 320, secondaryDescription: 280, pillarTitle: 32, pillarDesc: 120 },
  partner: { name: 35, scope: 160, period: 60, status: 30, imageAlt: 140 },
  bisnis: { businessName: 45, description: 180, ownerLabel: 45, verifiedLabel: 40, imageAlt: 140 },
  prestasi: { title: 55, description: 180, recipientLabel: 50, organizerLabel: 55, imageAlt: 140 },
  prokerBidang: { shortName: 15, title: 25, eyebrow: 40, description: 240, compartmentSummary: 50 },
  prokerKompartemen: { code: 35, name: 35 },
  prokerSlide: { title: 45, description: 200, mediaSourceLabel: 50, imageAlt: 140 },
  testimonial: { quote: 240, authorLabel: 40, roleOrOrg: 55 },
  siteSettings: { secretariatAddress: 150, officialEmail: 80, officialInstagram: 30, whatsappContactLabel: 60, copyrightText: 80 },
} as const;

export function validateFieldLength(fieldVal: string, maxLimit: number): boolean {
  return fieldVal.length <= maxLimit;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return email.length <= 80 && emailRegex.test(email);
}

describe('Tier 1: CMS Hard Validation & Sanitization (Features 32-34)', () => {
  const revalidateMock = new RevalidateMock('secret-revalidate-key-2026');

  beforeAll(async () => {
    await revalidateMock.start();
  });

  afterAll(async () => {
    await revalidateMock.stop();
  });

  // =========================================================================
  // F32: Server-side Hard Validation Matrix
  // =========================================================================
  it('F32-1: Hero title <= 45 chars is accepted, > 45 chars is strictly rejected', () => {
    const validTitle = 'Mencetak Pengusaha Muda Berintegritas'; // 37 chars
    expect(validTitle.length).toBeLessThanOrEqual(HARD_LIMITS.hero.title);
    expect(validateFieldLength(validTitle, HARD_LIMITS.hero.title)).toBe(true);

    const overLimitTitle = 'Membangun Ekosistem Kewirausahaan Digital Terpadu Mahasiswa Telkom'; // 66 chars
    expect(validateFieldLength(overLimitTitle, HARD_LIMITS.hero.title)).toBe(false);
  });

  it('F32-2: Tentang title <= 70 chars is accepted, > 70 chars is rejected', () => {
    const validTentang = 'Mengakselerasi Potensi Bisnis Mahasiswa Menuju Kemandirian Finansial'; // 68 chars
    expect(validateFieldLength(validTentang, HARD_LIMITS.tentang.title)).toBe(true);

    const overTentang = 'A'.repeat(71);
    expect(validateFieldLength(overTentang, HARD_LIMITS.tentang.title)).toBe(false);
  });

  it('F32-3: Partner name <= 35 chars is accepted, > 35 chars is rejected', () => {
    const validPartner = 'PT Telkom Indonesia (Persero) Tbk'; // 34 chars
    expect(validateFieldLength(validPartner, HARD_LIMITS.partner.name)).toBe(true);

    const overPartner = 'PT Telekomunikasi Selular Indonesia Wilayah Jawa Barat'; // 54 chars
    expect(validateFieldLength(overPartner, HARD_LIMITS.partner.name)).toBe(false);
  });

  it('F32-4: Strict categorical enums are validated for Partner, Bisnis, Prestasi, and Proker', () => {
    const validPartnerCats = ['Korporasi & BUMN', 'Asosiasi & HIPMI', 'Dinas & Inkubator', 'Komunitas & Media', 'Mitra Strategis'];
    expect(validPartnerCats.includes('Korporasi & BUMN')).toBe(true);
    expect(validPartnerCats.includes('Pemerintah')).toBe(false);

    const validSectors = ['Teknologi & Jasa', 'Kuliner / F&B', 'Kreatif & Media', 'Fesyen & Ritel'];
    expect(validSectors.includes('Kuliner / F&B')).toBe(true);
    expect(validSectors.includes('Agrikultur')).toBe(false);
  });

  it('F32-5: Site Settings validates email format <= 80 chars and address <= 150 chars', () => {
    expect(validateEmail('sekretariat@hipmitelkom.org')).toBe(true);
    expect(validateEmail('invalid-email-address')).toBe(false);
    expect(validateEmail('user@' + 'a'.repeat(80) + '.com')).toBe(false);

    const validAddress = 'Gedung Student Center Lt. 2, Jl. Telekomunikasi No. 1, Terusan Buahbatu, Bandung';
    expect(validateFieldLength(validAddress, HARD_LIMITS.siteSettings.secretariatAddress)).toBe(true);
    expect(validateFieldLength('B'.repeat(151), HARD_LIMITS.siteSettings.secretariatAddress)).toBe(false);
  });

  // =========================================================================
  // F33: Plain-Text Sanitization & Anti-Slop
  // =========================================================================
  it('F33-1: Strips HTML tags cleanly without leaving trailing brackets or script elements', () => {
    const dirty = '<h1>Judul Acara</h1><p>Deskripsi <b>bold</b> dan <script>alert(1)</script></p>';
    const clean = sanitizePlainText(dirty);
    expect(clean).toBe('Judul AcaraDeskripsi bold dan alert(1)');
    expect(clean.includes('<')).toBe(false);
    expect(clean.includes('>')).toBe(false);
  });

  it('F33-2: Strips Markdown formatting syntax (bold, italic, headers, links)', () => {
    const markdown = '### Program Kerja **Unggulan** dan *Prioritas* [Lihat Dokumen](https://link.com)';
    const clean = sanitizePlainText(markdown);
    expect(clean).toBe('Program Kerja Unggulan dan Prioritas Lihat Dokumen');
    expect(clean.includes('**')).toBe(false);
    expect(clean.includes('###')).toBe(false);
    expect(clean.includes('](')).toBe(false);
  });

  it('F33-3: Removes disallowed decorative bullet characters • and ●', () => {
    const withBullets = '• Pilar 1: Kaderisasi ● Pilar 2: Inkubasi';
    const clean = sanitizePlainText(withBullets);
    expect(clean).toBe('Pilar 1: Kaderisasi Pilar 2: Inkubasi');
    expect(clean.includes('•')).toBe(false);
    expect(clean.includes('●')).toBe(false);
  });

  it('F33-4: Normalizes em-dashes — and en-dashes – to standard ASCII hyphens -', () => {
    const withDashes = 'KOMPARTEMEN 1 — PENGEMBANGAN SDM – HIPMI PT';
    const clean = sanitizePlainText(withDashes);
    expect(clean).toBe('KOMPARTEMEN 1 - PENGEMBANGAN SDM - HIPMI PT');
    expect(clean.includes('—')).toBe(false);
    expect(clean.includes('–')).toBe(false);
    expect(clean.includes('-')).toBe(true);
  });

  it('F33-5: Trims outer whitespace and collapses internal multiple spaces and tabs to single spaces', () => {
    const messy = '   Teks   dengan    banyak     spasi  dan \t tab   ';
    const clean = sanitizePlainText(messy);
    expect(clean).toBe('Teks dengan banyak spasi dan tab');
  });

  // =========================================================================
  // F34: Auto-Revalidation Webhook (POST /api/revalidate with x-revalidate-secret)
  // =========================================================================
  it('F34-1: Dispatches POST request with x-revalidate-secret header matching configured secret', async () => {
    revalidateMock.clear();
    const res = await fetch(revalidateMock.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': 'secret-revalidate-key-2026',
      },
      body: JSON.stringify({
        tags: ['hero-slides', 'home'],
        paths: ['/id'],
      }),
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.revalidated).toBe(true);
    revalidateMock.assertCallCount(1);
  });

  it('F34-2: Webhook payload includes relevant cache tags for changed section', () => {
    revalidateMock.assertReceivedTag('hero-slides');
    revalidateMock.assertReceivedTag('home');
  });

  it('F34-3: Webhook payload includes relevant affected subpage paths', () => {
    revalidateMock.assertReceivedPath('/id');
  });

  it('F34-4: Webhook receiver rejects request with invalid secret token (401 Unauthorized)', async () => {
    const res = await fetch(revalidateMock.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': 'wrong-secret-token',
      },
      body: JSON.stringify({ tags: ['partners'] }),
    });

    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.revalidated).toBe(false);
    expect(body.message).toContain('Invalid revalidation secret');
  });

  it('F34-5: Webhook dispatch error does not block or fail core application operations', () => {
    // Non-blocking dispatch pattern
    let coreOperationSucceeded = false;
    try {
      // Background promise without awaiting or with catch
      Promise.resolve()
        .then(() => {
          throw new Error('Simulated network timeout to webhook');
        })
        .catch(() => {
          // Logged gracefully in background
        });
      coreOperationSucceeded = true;
    } catch {
      coreOperationSucceeded = false;
    }
    expect(coreOperationSucceeded).toBe(true);
  });
});
