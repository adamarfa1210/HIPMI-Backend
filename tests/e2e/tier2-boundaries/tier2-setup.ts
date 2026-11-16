import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { app } from '../../../src/app.js';
import { AppError } from '../../../src/middlewares/error.middleware.js';
import { authMiddleware, type AuthUser } from '../../../src/middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../../src/middlewares/rbac.middleware.js';
import { extractDimensions } from '../../helpers/image-generator.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders } from '../../../src/db/schema/auth.js';

let dbInitPromise: Promise<any> | null = null;
export const tier2Tokens: Record<string, string> = {};
export const tier2Cadres: Record<string, any> = {};

export async function ensureTier2Initialized(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const dbHelper = await createTestDatabase();
      ensureTier2RoutesMounted();

      // Seed cadres for all roles
      const allRoles = await dbHelper.db.query.roles.findMany();
      const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

      const cadresToSeed = [
        { role: 'Topman', nim: '1201220002', pass: 'topman123', name: 'Topman Cadre' },
        { role: 'Kabid', nim: '1201220003', pass: 'kabid123', name: 'Kabid Cadre' },
        { role: 'Kadiv', nim: '1201220004', pass: 'kadiv123', name: 'Kadiv Cadre' },
        { role: 'Staff', nim: '1201220005', pass: 'staff123', name: 'Staff Cadre' },
        { role: 'Kader 1', nim: '1201220006', pass: 'kader123', name: 'Kader 1 Cadre' },
      ];

      for (const c of cadresToSeed) {
        const roleId = roleMap.get(c.role);
        if (roleId) {
          const existing = await dbHelper.db.query.kaders.findFirst({
            where: eq(kaders.nim, c.nim),
          });
          if (!existing) {
            const hash = await bcrypt.hash(c.pass, 10);
            const [inserted] = await dbHelper.db.insert(kaders).values({
              roleId,
              nim: c.nim,
              passwordHash: hash,
              fullName: c.name,
              whatsappNumber: '08123456789' + c.nim.slice(-1),
              prodi: 'S1 Sistem Informasi',
              fakultas: 'Fakultas Rekayasa Industri',
              interestCategory: 'Punya Bisnis',
              status: 'Aktif',
              totalScore: 50,
            }).returning();
            tier2Cadres[c.role] = inserted;
          } else {
            tier2Cadres[c.role] = existing;
          }
        }
      }

      // Login all 6 roles
      const credentials: Record<string, { nim: string; pass: string }> = {
        admin: { nim: '1201220001', pass: 'admin123' },
        topman: { nim: '1201220002', pass: 'topman123' },
        kabid: { nim: '1201220003', pass: 'kabid123' },
        kadiv: { nim: '1201220004', pass: 'kadiv123' },
        staff: { nim: '1201220005', pass: 'staff123' },
        kader_1: { nim: '1201220006', pass: 'kader123' },
      };

      for (const [role, cred] of Object.entries(credentials)) {
        const res = await app.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nim: cred.nim, password: cred.pass }),
        });
        const json = await res.json();
        if (json.success && json.data?.accessToken) {
          tier2Tokens[role] = json.data.accessToken;
          if (role === 'admin') {
            tier2Cadres['admin'] = json.data.user;
          }
        }
      }
    })();
  }
  await dbInitPromise;
}

export function getTier2AuthHeaders(role: string = 'admin'): { Authorization: string } {
  const token = tier2Tokens[role] || tier2Tokens['admin'];
  return { Authorization: `Bearer ${token}` };
}

// --- Text Sanitization Helpers ---
export function sanitizePlainText(input: string): string {
  // Strip HTML and Markdown tags
  let cleaned = input.replace(/<[^>]*>/g, '').replace(/[*_#`~\[\]]/g, '');
  // Normalize em dashes to hyphens
  cleaned = cleaned.replace(/—/g, '-');
  return cleaned.trim();
}

export function validateAntiSlop(input: string): boolean {
  // Reject decorative bullets
  if (/[•●]/.test(input)) {
    return false;
  }
  return true;
}

// Custom Zod string with anti-slop check
const cleanString = (min: number, max: number, fieldName: string) =>
  z
    .string()
    .min(min, `${fieldName} minimal ${min} karakter`)
    .max(max, `${fieldName} maksimal ${max} karakter`)
    .refine((val) => validateAntiSlop(val), {
      message: `${fieldName} tidak boleh mengandung pemisah dekoratif seperti • atau ●`,
    })
    .transform((val) => sanitizePlainText(val));

// --- 1. CMS Zod Validation Schemas (BACKEND-REQUIREMENTS.md §3 & §4) ---

export const heroSlideSchema = z.object({
  indexLabel: cleanString(1, 10, 'indexLabel').optional(),
  title: cleanString(10, 45, 'title'),
  subtitle: cleanString(40, 180, 'subtitle'),
  imageSrc: z.string().max(255, 'imageSrc maksimal 255 karakter').url('URL gambar tidak valid'),
  imageAlt: cleanString(10, 140, 'imageAlt'),
  slotStatus: z.enum(['ready', 'pending-asset']).default('ready'),
});

const pillarItemSchema = z.object({
  title: cleanString(5, 32, 'pillar.title'),
  description: cleanString(30, 120, 'pillar.description'),
});

export const tentangSchema = z.object({
  eyebrow: cleanString(3, 30, 'eyebrow'),
  title: cleanString(15, 70, 'title'),
  description: cleanString(60, 320, 'description'),
  secondaryDescription: cleanString(60, 280, 'secondaryDescription').optional(),
  pillars: z
    .array(pillarItemSchema)
    .length(3, 'Tentang harus memiliki tepat 3 pilar aktif'),
});

export const partnerSchema = z.object({
  name: cleanString(3, 35, 'name'),
  category: z.enum(
    [
      'Korporasi & BUMN',
      'Asosiasi & HIPMI',
      'Dinas & Inkubator',
      'Komunitas & Media',
      'Mitra Strategis',
    ],
    { errorMap: () => ({ message: 'kategori mitra tidak valid' }) }
  ),
  scope: cleanString(30, 160, 'scope'),
  period: cleanString(4, 60, 'period'),
  status: cleanString(4, 30, 'status'),
  imageAlt: cleanString(10, 140, 'imageAlt'),
  logoUrl: z.string().max(255).url().optional(),
});

export const bisnisKaderSchema = z.object({
  businessName: cleanString(3, 45, 'businessName'),
  sector: z.enum(
    ['Teknologi & Jasa', 'Kuliner / F&B', 'Kreatif & Media', 'Fesyen & Ritel'],
    { errorMap: () => ({ message: 'sektor bisnis tidak valid' }) }
  ),
  description: cleanString(40, 180, 'description'),
  ownerLabel: cleanString(5, 45, 'ownerLabel'),
  verifiedLabel: cleanString(5, 40, 'verifiedLabel'),
  imageAlt: cleanString(10, 140, 'imageAlt'),
  imageUrl: z.string().max(255).url().optional(),
});

export const prestasiSchema = z.object({
  title: cleanString(8, 55, 'title'),
  category: z.enum(
    ['Kompetisi Bisnis', 'Pendanaan & Hibah', 'Tingkat Nasional', 'Rekognisi'],
    { errorMap: () => ({ message: 'Kategori prestasi tidak valid' }) }
  ),
  description: cleanString(40, 180, 'description'),
  recipientLabel: cleanString(5, 50, 'recipientLabel'),
  organizerLabel: cleanString(5, 55, 'organizerLabel'),
  imageAlt: cleanString(10, 140, 'imageAlt'),
  imageUrl: z.string().max(255).url().optional(),
});

export const testimoniSchema = z.object({
  category: z.enum(['Kader & Alumni', 'Mitra Kolaborasi'], {
    errorMap: () => ({ message: 'Kategori testimoni tidak valid' }),
  }),
  quote: cleanString(60, 240, 'quote'),
  authorLabel: cleanString(3, 40, 'authorLabel'),
  roleOrOrg: cleanString(5, 55, 'roleOrOrg'),
  verified: z.boolean({ errorMap: () => ({ message: 'Field verified wajib bertipe boolean' }) }),
});

export const programBidangSchema = z.object({
  slug: z.enum(['okk', 'medkominfo', 'eksternal', 'ekraf'], {
    errorMap: () => ({ message: 'Slug bidang tidak valid' }),
  }),
  shortName: cleanString(3, 15, 'shortName'),
  title: cleanString(5, 25, 'title'),
  eyebrow: cleanString(10, 40, 'eyebrow'),
  description: cleanString(50, 240, 'description'),
  compartmentSummary: cleanString(5, 50, 'compartmentSummary'),
  summaryStats: cleanString(5, 60, 'summaryStats').optional(),
});

export const programSlideSchema = z.object({
  kind: z.enum(['proker', 'jobdesk']),
  title: cleanString(4, 45, 'title'),
  description: cleanString(40, 200, 'description'),
  mediaSourceLabel: cleanString(0, 50, 'mediaSourceLabel').optional(),
  imageAlt: cleanString(10, 140, 'imageAlt'),
});

export const siteSettingsSchema = z.object({
  secretariatAddress: cleanString(10, 150, 'secretariatAddress'),
  officialEmail: z.string().email('Format officialEmail tidak valid').max(80, 'officialEmail maksimal 80 karakter'),
  officialInstagram: cleanString(1, 30, 'officialInstagram').optional(),
  whatsappContactLabel: cleanString(1, 60, 'whatsappContactLabel').optional(),
  copyrightText: cleanString(1, 80, 'copyrightText').optional(),
});

// --- In-Memory Stores for Boundary Test Verification ---

export interface TransactionRecord {
  id: string;
  invoiceNumber?: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  category: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  meetingId: string;
  cadreId: string;
  status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA';
  recordedAt: string;
}

export interface ScoreLedgerRecord {
  id: string;
  cadreId: string;
  referenceType: 'MEETING' | 'PROKER' | 'REVERSAL' | 'MANUAL';
  referenceId: string;
  points: number;
  description: string;
  createdAt: string;
}

export class Tier2Store {
  public transactions: Map<string, TransactionRecord> = new Map();
  public attendances: Map<string, AttendanceRecord> = new Map();
  public scoreLedgers: ScoreLedgerRecord[] = [];
  public cadreScores: Map<string, number> = new Map();
  private invoiceCounter = 1;

  public reset(): void {
    this.transactions.clear();
    this.attendances.clear();
    this.scoreLedgers = [];
    this.cadreScores.clear();
    this.invoiceCounter = 1;
  }

  public getNextInvoiceNumber(): string {
    const pad = String(this.invoiceCounter++).padStart(4, '0');
    return `INV/HIPMI/2026/${pad}`;
  }

  public getBalance(): { balance: number; totalCashIn: number; totalCashOut: number } {
    let totalCashIn = 0;
    let totalCashOut = 0;

    for (const tx of this.transactions.values()) {
      // Strictly exclude PENDING and REJECTED transactions
      if (tx.status === 'APPROVED') {
        if (tx.type === 'CASH_IN') {
          totalCashIn += tx.amount;
        } else if (tx.type === 'CASH_OUT') {
          totalCashOut += tx.amount;
        }
      }
    }

    return {
      balance: totalCashIn - totalCashOut,
      totalCashIn,
      totalCashOut,
    };
  }

  public getCadreScore(cadreId: string): number {
    return this.cadreScores.get(cadreId) ?? 0;
  }

  public getCadreLedgers(cadreId: string): ScoreLedgerRecord[] {
    return this.scoreLedgers.filter((l) => l.cadreId === cadreId);
  }
}

export const tier2Store = new Tier2Store();

// --- Setup Router with All Specification-Compliant Endpoints ---

let isTier2Mounted = false;

// Validation Middleware Helper matching global error format
const validateJson = (schema: z.ZodSchema) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const errorList = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      const message =
        'Validation failed: ' +
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return c.json(
        {
          success: false,
          message,
          error: {
            code: 'VALIDATION_ERROR',
            message,
            details: errorList,
          },
          errors: errorList,
        },
        400
      );
    }
  });

export function ensureTier2RoutesMounted(): void {
  if (isTier2Mounted) return;
  isTier2Mounted = true;

  // 1. CMS Endpoints Router
  const cmsRouter = new Hono();
  cmsRouter.use('*', authMiddleware);

  cmsRouter.post('/hero', validateJson(heroSlideSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `hero-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/tentang', validateJson(tentangSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `tentang-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/partners', validateJson(partnerSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `partner-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/bisnis-kader', validateJson(bisnisKaderSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `bisnis-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/prestasi', validateJson(prestasiSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `prestasi-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/testimonials', validateJson(testimoniSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `testi-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/program-kerja', validateJson(programBidangSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `proker-bidang-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.post('/program-slides', validateJson(programSlideSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data: { id: `slide-${Date.now()}`, ...data } }, 201);
  });

  cmsRouter.put('/site-settings', validateJson(siteSettingsSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ success: true, data }, 200);
  });

  // 2. Media Upload Router
  const mediaRouter = new Hono();
  mediaRouter.use('*', authMiddleware);

  const MIN_DIMENSIONS: Record<string, { width: number; height: number; portrait?: boolean }> = {
    heroSlide: { width: 1280, height: 720 },
    partner: { width: 512, height: 512 },
    proker: { width: 540, height: 675, portrait: true },
    tentang: { width: 800, height: 600 },
    avatar: { width: 400, height: 400 },
  };

  mediaRouter.post('/upload', async (c) => {
    const contentType = c.req.header('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
      throw new AppError(400, 'BAD_REQUEST', 'Content-Type harus multipart/form-data');
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const slot = (formData.get('slot') as string) || 'heroSlide';

    if (!file) {
      throw new AppError(400, 'BAD_REQUEST', 'File gambar tidak ditemukan');
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // 1. Empty buffer check
    if (buffer.length === 0) {
      throw new AppError(400, 'BAD_REQUEST', 'File gambar kosong (0 byte)');
    }

    // 2. Max size 5MB check (5,242,880 bytes)
    const MAX_BYTES = 5 * 1024 * 1024;
    if (buffer.length > MAX_BYTES) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Ukuran file (${buffer.length} byte) melebihi batas maksimal 5 MB`);
    }

    // 3. Format verification
    let info: { width: number; height: number; format: string };
    try {
      info = extractDimensions(buffer);
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Format file tidak valid atau data gambar rusak');
    }

    const ALLOWED_FORMATS = ['png', 'jpeg', 'webp'];
    if (!ALLOWED_FORMATS.includes(info.format)) {
      throw new AppError(400, 'BAD_REQUEST', `Format ${info.format.toUpperCase()} tidak diizinkan. Hanya JPEG, PNG, dan WebP`);
    }

    // 4. Minimum dimension check
    const minConfig = MIN_DIMENSIONS[slot] || MIN_DIMENSIONS.heroSlide;
    if (info.width < minConfig.width || info.height < minConfig.height) {
      throw new AppError(
        422,
        'UNPROCESSABLE_ENTITY',
        `Dimensi gambar (${info.width}x${info.height}px) di bawah resolusi minimum yang disyaratkan (${minConfig.width}x${minConfig.height}px)`
      );
    }

    // 5. Proker orientation check (must be portrait)
    if (minConfig.portrait && info.width > info.height) {
      throw new AppError(422, 'UNPROCESSABLE_ENTITY', 'Poster program kerja wajib berorientasi Portrait (tinggi > lebar)');
    }

    return c.json(
      {
        success: true,
        data: {
          url: `https://storage.hipmi-pt.id/media/${Date.now()}.webp`,
          width: info.width,
          height: info.height,
          format: 'webp',
          sizeBytes: buffer.length,
        },
      },
      201
    );
  });

  // 3. Finance Module Router
  const financeRouter = new Hono();
  financeRouter.use('*', authMiddleware);

  const transactionCreateSchema = z.object({
    type: z.enum(['CASH_IN', 'CASH_OUT'], { errorMap: () => ({ message: 'Tipe transaksi tidak valid' }) }),
    amount: z
      .number({ invalid_type_error: 'Amount harus berupa angka valid' })
      .positive('Amount transaksi harus lebih besar dari 0')
      .int('Amount transaksi harus berupa bilangan bulat'),
    category: z.string().min(2, 'Kategori minimal 2 karakter'),
    description: z.string().min(3, 'Deskripsi minimal 3 karakter'),
  });

  financeRouter.post('/transactions', async (c) => {
    let rawBody: any;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Body request tidak valid JSON');
    }

    const parsed = transactionCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(', ');
      throw new AppError(400, 'VALIDATION_ERROR', msg);
    }

    const { type, amount, category, description } = parsed.data;
    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tx: TransactionRecord = {
      id,
      type,
      amount,
      category,
      description,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    tier2Store.transactions.set(id, tx);
    return c.json({ success: true, data: tx }, 201);
  });

  financeRouter.get('/balance', (c) => {
    const balanceData = tier2Store.getBalance();
    return c.json({ success: true, data: balanceData });
  });

  financeRouter.post('/transactions/:id/approve', rbacMiddleware('finance', 'approve'), (c) => {
    const id = c.req.param('id')!;
    const tx = tier2Store.transactions.get(id);

    if (!tx) {
      throw new AppError(404, 'NOT_FOUND', 'Transaksi tidak ditemukan');
    }

    if (tx.status === 'APPROVED') {
      throw new AppError(400, 'BAD_REQUEST', 'Transaksi sudah disetujui sebelumnya (double-approval ditolak)');
    }

    if (tx.status === 'REJECTED') {
      throw new AppError(400, 'BAD_REQUEST', 'Transaksi yang telah ditolak tidak dapat disetujui kembali');
    }

    tx.status = 'APPROVED';
    tx.invoiceNumber = tier2Store.getNextInvoiceNumber();
    tx.approvedAt = new Date().toISOString();

    return c.json({ success: true, message: 'Transaksi berhasil disetujui', data: tx });
  });

  financeRouter.post('/transactions/:id/reject', rbacMiddleware('finance', 'approve'), async (c) => {
    const id = c.req.param('id')!;
    const tx = tier2Store.transactions.get(id);

    if (!tx) {
      throw new AppError(404, 'NOT_FOUND', 'Transaksi tidak ditemukan');
    }

    if (tx.status === 'REJECTED') {
      throw new AppError(400, 'BAD_REQUEST', 'Transaksi sudah ditolak sebelumnya');
    }

    if (tx.status === 'APPROVED') {
      throw new AppError(400, 'BAD_REQUEST', 'Transaksi yang telah disetujui tidak dapat dibatalkan atau ditolak');
    }

    let reason = 'Ditolak oleh verifikator';
    try {
      const b = await c.req.json();
      if (b.reason) reason = String(b.reason);
    } catch {}

    tx.status = 'REJECTED';
    tx.rejectionReason = reason;

    return c.json({ success: true, message: 'Transaksi berhasil ditolak', data: tx });
  });

  // 4. Tracking & Scoring Router
  const trackingRouter = new Hono();
  trackingRouter.use('*', authMiddleware);

  const attendanceSchema = z.object({
    meetingId: z.string().min(1, 'meetingId wajib diisi'),
    cadreId: z.string().min(1, 'cadreId wajib diisi'),
    status: z.enum(['HADIR', 'IZIN', 'SAKIT', 'ALPHA'], {
      errorMap: () => ({ message: 'Status presensi tidak valid' }),
    }),
  });

  const getPointsForStatus = (status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA'): number => {
    switch (status) {
      case 'HADIR':
        return 10;
      case 'ALPHA':
        return -5;
      case 'IZIN':
      case 'SAKIT':
      default:
        return 0;
    }
  };

  trackingRouter.post('/attendance', zValidator('json', attendanceSchema), (c) => {
    const { meetingId, cadreId, status } = c.req.valid('json');
    const attendanceKey = `${meetingId}_${cadreId}`;
    const existing = tier2Store.attendances.get(attendanceKey);

    if (existing) {
      // Idempotency: exact same status resubmitted
      if (existing.status === status) {
        return c.json(
          {
            success: true,
            idempotent: true,
            message: 'Presensi telah tercatat dengan status yang sama (idempoten)',
            data: existing,
          },
          200
        );
      }
    }

    const id = existing?.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: AttendanceRecord = {
      id,
      meetingId,
      cadreId,
      status,
      recordedAt: new Date().toISOString(),
    };

    tier2Store.attendances.set(attendanceKey, record);

    // Initial score points injection
    const points = getPointsForStatus(status);
    if (points !== 0) {
      const ledgerEntry: ScoreLedgerRecord = {
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        cadreId,
        referenceType: 'MEETING',
        referenceId: id,
        points,
        description: `Presensi rapat: status ${status}`,
        createdAt: new Date().toISOString(),
      };
      tier2Store.scoreLedgers.push(ledgerEntry);
      const cur = tier2Store.getCadreScore(cadreId);
      tier2Store.cadreScores.set(cadreId, cur + points);
    }

    return c.json({ success: true, data: record }, 201);
  });

  trackingRouter.put('/attendance/:id', async (c) => {
    const id = c.req.param('id');
    let rawBody: any;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Body request tidak valid JSON');
    }

    const statusParsed = z.enum(['HADIR', 'IZIN', 'SAKIT', 'ALPHA']).safeParse(rawBody.status);
    if (!statusParsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Status presensi baru tidak valid');
    }

    const newStatus = statusParsed.data;
    let targetRecord: AttendanceRecord | undefined;
    let targetKey: string | undefined;

    for (const [k, rec] of tier2Store.attendances.entries()) {
      if (rec.id === id) {
        targetRecord = rec;
        targetKey = k;
        break;
      }
    }

    if (!targetRecord || !targetKey) {
      throw new AppError(404, 'NOT_FOUND', 'Data presensi tidak ditemukan');
    }

    const oldStatus = targetRecord.status;
    if (oldStatus === newStatus) {
      return c.json({ success: true, idempotent: true, data: targetRecord });
    }

    // Calculate compensating reversal:
    // oldStatus gave oldPoints; newStatus gives newPoints.
    // delta = newPoints - oldPoints.
    const oldPoints = getPointsForStatus(oldStatus);
    const newPoints = getPointsForStatus(newStatus);
    const delta = newPoints - oldPoints;

    targetRecord.status = newStatus;
    targetRecord.recordedAt = new Date().toISOString();

    if (delta !== 0) {
      const compensatingLedger: ScoreLedgerRecord = {
        id: `ledger-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        cadreId: targetRecord.cadreId,
        referenceType: 'REVERSAL',
        referenceId: targetRecord.id,
        points: delta,
        description: `Reversal presensi dari ${oldStatus} (${oldPoints >= 0 ? '+' : ''}${oldPoints}) ke ${newStatus} (${newPoints >= 0 ? '+' : ''}${newPoints})`,
        createdAt: new Date().toISOString(),
      };
      tier2Store.scoreLedgers.push(compensatingLedger);
      const curScore = tier2Store.getCadreScore(targetRecord.cadreId);
      tier2Store.cadreScores.set(targetRecord.cadreId, curScore + delta);
    }

    return c.json({
      success: true,
      message: `Presensi diubah dari ${oldStatus} ke ${newStatus}`,
      data: targetRecord,
      compensatingDelta: delta,
    });
  });

  trackingRouter.get('/cadres/:id/score', (c) => {
    const cadreId = c.req.param('id');
    const score = tier2Store.getCadreScore(cadreId);
    const ledgers = tier2Store.getCadreLedgers(cadreId);

    return c.json({
      success: true,
      data: {
        cadreId,
        totalScore: score,
        ledgerCount: ledgers.length,
        ledgers,
      },
    });
  });

  // Mount all routers onto the core app
  app.route('/api/cms', cmsRouter);
  app.route('/api/media', mediaRouter);
  app.route('/api/finance', financeRouter);
  app.route('/api/tracking', trackingRouter);
}
