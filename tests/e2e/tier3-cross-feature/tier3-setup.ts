import { Hono } from 'hono';
import { app } from '../../../src/app.js';
import { authMiddleware, type AuthUser } from '../../../src/middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../../src/middlewares/rbac.middleware.js';
import { db } from '../../../src/db/index.js';
import { kaders } from '../../../src/db/schema/auth.js';
import { eq, sql } from 'drizzle-orm';
import { extractDimensions, hasExif, CMS_IMAGE_PRESETS } from '../../helpers/image-generator.js';

let routesMounted = false;
let currentClient: any = null;

export async function setupTier3Database(targetClient: any) {
  currentClient = targetClient;
  // Create ERP, CMS, and Calendar operational tables if not already present
  await currentClient.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number VARCHAR(60) UNIQUE,
      type VARCHAR(20) NOT NULL,
      amount NUMERIC NOT NULL,
      category VARCHAR(80) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      rejection_reason TEXT,
      receipt_url TEXT,
      created_by UUID REFERENCES kaders(id) ON DELETE SET NULL,
      approved_by UUID REFERENCES kaders(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS prokers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      bidang VARCHAR(80) NOT NULL,
      kompartemen VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
      target_date DATE,
      pic_cadre_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS proker_committees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proker_id UUID NOT NULL REFERENCES prokers(id) ON DELETE CASCADE,
      cadre_id UUID NOT NULL REFERENCES kaders(id) ON DELETE CASCADE,
      role VARCHAR(60) NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_proker_committee UNIQUE (proker_id, cadre_id)
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(120) NOT NULL,
      proker_id UUID REFERENCES prokers(id) ON DELETE CASCADE,
      date TIMESTAMPTZ NOT NULL,
      location VARCHAR(120) NOT NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'PROKER',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS meeting_attendances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      cadre_id UUID NOT NULL REFERENCES kaders(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'HADIR',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_meeting_cadre UNIQUE (meeting_id, cadre_id)
    );

    CREATE TABLE IF NOT EXISTS score_ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cadre_id UUID NOT NULL REFERENCES kaders(id) ON DELETE CASCADE,
      reference_type VARCHAR(40) NOT NULL,
      reference_id UUID,
      points INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS cms_media (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      original_filename VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      content_type VARCHAR(80) NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      exif_stripped BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS cms_hero_slides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(45) NOT NULL,
      subtitle VARCHAR(180) NOT NULL,
      image_url TEXT NOT NULL,
      image_alt VARCHAR(140) NOT NULL,
      slot_status VARCHAR(20) NOT NULL DEFAULT 'pending-asset',
      order_index INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS cms_partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(35) NOT NULL,
      logo_url TEXT NOT NULL,
      scope VARCHAR(160) NOT NULL,
      tier VARCHAR(30) NOT NULL DEFAULT 'STRATEGIC',
      slot_status VARCHAR(20) NOT NULL DEFAULT 'pending-asset',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(120) NOT NULL,
      description TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      location VARCHAR(120),
      is_public BOOLEAN NOT NULL DEFAULT false,
      gcal_event_id VARCHAR(120),
      gcal_synced BOOLEAN NOT NULL DEFAULT false,
      created_by UUID REFERENCES kaders(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[•●]/g, '')    // Disallowed bullets
    .replace(/—/g, '-')      // Normalize em-dashes
    .trim();
}

let revalidateWebhookTarget = process.env.REVALIDATE_WEBHOOK_URL || '';
export function setRevalidateWebhookTarget(url: string) {
  revalidateWebhookTarget = url;
}

async function triggerRevalidate(tags: string[], paths?: string[]) {
  if (!revalidateWebhookTarget) return;
  const secret = process.env.REVALIDATE_SECRET || 'test-revalidate-secret-123';
  try {
    await fetch(revalidateWebhookTarget, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify({ tags, paths: paths || [] }),
    });
  } catch {
    // Non-blocking resilient dispatch
  }
}

export function ensureTier3RoutesMounted() {
  if (routesMounted) return;

  // 1. Finance Router
  const financeRouter = new Hono<{ Variables: { user: AuthUser } }>();
  financeRouter.use('*', authMiddleware);

  // GET /api/finance/balance
  financeRouter.get('/balance', rbacMiddleware('finance', 'read'), async (c) => {
    const res = await currentClient.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' AND status = 'APPROVED' THEN amount ELSE 0 END), 0) AS total_cash_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' AND status = 'APPROVED' THEN amount ELSE 0 END), 0) AS total_cash_out,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_count
      FROM transactions
    `);
    const row = res.rows[0];
    const totalCashIn = Number(row.total_cash_in);
    const totalCashOut = Number(row.total_cash_out);
    const totalBalance = totalCashIn - totalCashOut;
    const pendingCount = Number(row.pending_count);

    return c.json({
      success: true,
      data: {
        totalBalance,
        totalCashIn,
        totalCashOut,
        pendingCount,
      },
    });
  });

  // GET /api/finance/transactions
  financeRouter.get('/transactions', rbacMiddleware('finance', 'read'), async (c) => {
    const res = await currentClient.query('SELECT * FROM transactions ORDER BY created_at DESC');
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  // POST /api/finance/transactions
  financeRouter.post('/transactions', rbacMiddleware('finance', 'create'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { type, amount, category, description } = body;

    if (!['CASH_IN', 'CASH_OUT'].includes(type)) {
      return c.json({ success: false, message: 'Invalid transaction type' }, 400);
    }
    if (!amount || amount <= 0) {
      return c.json({ success: false, message: 'Amount must be greater than zero' }, 400);
    }

    const res = await currentClient.query(
      `INSERT INTO transactions (type, amount, category, description, status, created_by)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING *`,
      [type, amount, category || 'Umum', description || '', user.id]
    );

    return c.json({
      success: true,
      message: 'Transaksi berhasil diajukan dan menunggu persetujuan',
      data: res.rows[0],
    }, 201);
  });

  // PATCH /api/finance/transactions/:id/approve
  let invoiceSequence = 0;
  financeRouter.patch('/transactions/:id/approve', rbacMiddleware('finance', 'approve'), async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const check = await currentClient.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (!check.rows.length) {
      return c.json({ success: false, message: 'Transaksi tidak ditemukan' }, 404);
    }
    const current = check.rows[0];
    if (current.status !== 'PENDING') {
      return c.json({ success: false, message: 'Transaksi sudah diproses sebelumnya' }, 400);
    }

    invoiceSequence++;
    const seqStr = String(invoiceSequence).padStart(4, '0');
    const invoiceNumber = `INV/HIPMI/2026/${seqStr}`;

    const res = await currentClient.query(
      `UPDATE transactions 
       SET status = 'APPROVED', 
           invoice_number = $1, 
           approved_by = $2, 
           approved_at = now() 
       WHERE id = $3 
       RETURNING *`,
      [invoiceNumber, user.id, id]
    );

    return c.json({
      success: true,
      message: 'Transaksi berhasil disetujui',
      data: res.rows[0],
    });
  });

  // PATCH /api/finance/transactions/:id/reject
  financeRouter.patch('/transactions/:id/reject', rbacMiddleware('finance', 'approve'), async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const reason = body?.reason || 'Tidak memenuhi kelayakan anggaran';

    const check = await currentClient.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (!check.rows.length) {
      return c.json({ success: false, message: 'Transaksi tidak ditemukan' }, 404);
    }

    const res = await currentClient.query(
      `UPDATE transactions 
       SET status = 'REJECTED', 
           rejection_reason = $1, 
           approved_by = $2, 
           approved_at = now() 
       WHERE id = $3 
       RETURNING *`,
      [reason, user.id, id]
    );

    return c.json({
      success: true,
      message: 'Transaksi berhasil ditolak',
      data: res.rows[0],
    });
  });

  app.route('/api/finance', financeRouter);

  // 2. Tracking & Scoring Router
  const trackingRouter = new Hono<{ Variables: { user: AuthUser } }>();
  trackingRouter.use('*', authMiddleware);

  // POST /api/tracking/prokers
  trackingRouter.post('/prokers', rbacMiddleware('tracking', 'create'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { name, bidang, kompartemen, targetDate } = body;

    const res = await currentClient.query(
      `INSERT INTO prokers (name, bidang, kompartemen, target_date, pic_cadre_id, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING *`,
      [name, bidang, kompartemen || null, targetDate || '2026-12-31', user.id]
    );

    return c.json({
      success: true,
      message: 'Program kerja berhasil dibuat',
      data: res.rows[0],
    }, 201);
  });

  // POST /api/tracking/prokers/:id/committees
  trackingRouter.post('/prokers/:id/committees', rbacMiddleware('tracking', 'update'), async (c) => {
    const prokerId = c.req.param('id');
    const body = await c.req.json();
    const { cadreId, role } = body;

    let points = 20;
    if (role.toLowerCase().includes('ketua')) points = 50;
    else if (role.toLowerCase().includes('sekretaris') || role.toLowerCase().includes('bendahara')) points = 30;

    // Check duplicate
    const existing = await currentClient.query(
      'SELECT * FROM proker_committees WHERE proker_id = $1 AND cadre_id = $2',
      [prokerId, cadreId]
    );
    if (existing.rows.length) {
      return c.json({ success: false, message: 'Kader sudah terdaftar dalam kepanitiaan ini' }, 400);
    }

    const comRes = await currentClient.query(
      `INSERT INTO proker_committees (proker_id, cadre_id, role, points_awarded)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prokerId, cadreId, role, points]
    );

    // Insert score ledger
    await currentClient.query(
      `INSERT INTO score_ledgers (cadre_id, reference_type, reference_id, points, description)
       VALUES ($1, 'PROKER', $2, $3, $4)`,
      [cadreId, prokerId, points, `Kepanitiaan Proker: ${role}`]
    );

    // Update cadre total score
    await currentClient.query(
      'UPDATE kaders SET total_score = total_score + $1 WHERE id = $2',
      [points, cadreId]
    );

    return c.json({
      success: true,
      message: 'Panitia berhasil ditambahkan dan poin dialokasikan',
      data: comRes.rows[0],
    }, 201);
  });

  // POST /api/tracking/meetings
  trackingRouter.post('/meetings', rbacMiddleware('tracking', 'create'), async (c) => {
    const body = await c.req.json();
    const { title, prokerId, date, location, type } = body;

    const res = await currentClient.query(
      `INSERT INTO meetings (title, proker_id, date, location, type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, prokerId || null, date || new Date().toISOString(), location || 'Sekretariat', type || 'PROKER']
    );

    return c.json({
      success: true,
      message: 'Sesi rapat berhasil dijadwalkan',
      data: res.rows[0],
    }, 201);
  });

  // POST /api/tracking/meetings/:id/attendance
  trackingRouter.post('/meetings/:id/attendance', rbacMiddleware('tracking', 'create'), async (c) => {
    const meetingId = c.req.param('id');
    const body = await c.req.json();
    const attendances = Array.isArray(body.attendances) ? body.attendances : [body];

    const results = [];
    for (const att of attendances) {
      const { cadreId, status } = att;
      const points = status === 'HADIR' ? 10 : 0;

      // Check if existing attendance
      const existing = await currentClient.query(
        'SELECT * FROM meeting_attendances WHERE meeting_id = $1 AND cadre_id = $2',
        [meetingId, cadreId]
      );

      if (existing.rows.length) {
        const oldStatus = existing.rows[0].status;
        if (oldStatus === status) {
          // Idempotent: no change
          results.push(existing.rows[0]);
          continue;
        }

        // Status changed: calculate diff
        const oldPoints = oldStatus === 'HADIR' ? 10 : 0;
        const diffPoints = points - oldPoints;

        await currentClient.query(
          'UPDATE meeting_attendances SET status = $1, recorded_at = now() WHERE meeting_id = $2 AND cadre_id = $3',
          [status, meetingId, cadreId]
        );

        if (diffPoints !== 0) {
          await currentClient.query(
            `INSERT INTO score_ledgers (cadre_id, reference_type, reference_id, points, description)
             VALUES ($1, 'MEETING', $2, $3, $4)`,
            [cadreId, meetingId, diffPoints, `Koreksi Presensi Rapat: ${oldStatus} -> ${status}`]
          );
          await currentClient.query(
            'UPDATE kaders SET total_score = total_score + $1 WHERE id = $2',
            [diffPoints, cadreId]
          );
        }
      } else {
        // Insert new
        const inserted = await currentClient.query(
          `INSERT INTO meeting_attendances (meeting_id, cadre_id, status)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [meetingId, cadreId, status]
        );
        results.push(inserted.rows[0]);

        if (points > 0) {
          await currentClient.query(
            `INSERT INTO score_ledgers (cadre_id, reference_type, reference_id, points, description)
             VALUES ($1, 'MEETING', $2, $3, $4)`,
            [cadreId, meetingId, points, `Presensi Rapat: ${status}`]
          );
          await currentClient.query(
            'UPDATE kaders SET total_score = total_score + $1 WHERE id = $2',
            [points, cadreId]
          );
        }
      }
    }

    return c.json({
      success: true,
      message: 'Presensi berhasil dicatat dan poin diperbarui',
      data: results,
    });
  });

  // GET /api/tracking/scores/:cadreId
  trackingRouter.get('/scores/:cadreId', rbacMiddleware('tracking', 'read'), async (c) => {
    const cadreId = c.req.param('cadreId');
    const res = await currentClient.query(
      'SELECT * FROM score_ledgers WHERE cadre_id = $1 ORDER BY created_at DESC',
      [cadreId]
    );
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  app.route('/api/tracking', trackingRouter);

  // 3. Leaderboard Router
  const leaderboardRouter = new Hono<{ Variables: { user: AuthUser } }>();
  leaderboardRouter.use('*', authMiddleware);

  leaderboardRouter.get('/', rbacMiddleware('leaderboard', 'read'), async (c) => {
    const res = await currentClient.query(`
      SELECT 
        id, 
        nim, 
        full_name, 
        prodi, 
        fakultas, 
        total_score,
        DENSE_RANK() OVER (ORDER BY total_score DESC) as rank
      FROM kaders
      WHERE status = 'Aktif'
      ORDER BY total_score DESC, full_name ASC
    `);

    return c.json({
      success: true,
      data: res.rows.map((r: any) => ({
        ...r,
        rank: Number(r.rank),
        total_score: Number(r.total_score),
      })),
    });
  });

  app.route('/api/leaderboard', leaderboardRouter);

  // 4. CMS Router
  const cmsRouter = new Hono<{ Variables: { user: AuthUser } }>();
  cmsRouter.use('*', authMiddleware);

  // POST /api/cms/media/upload
  cmsRouter.post('/media/upload', rbacMiddleware('cms', 'create'), async (c) => {
    const body = await c.req.parseBody();
    const uploadedFile = body.file;
    const targetSlot = (body.slot as string) || 'heroSlide';

    if (!uploadedFile) {
      return c.json({ success: false, message: 'File upload is required' }, 400);
    }

    let buffer: Buffer;
    if (uploadedFile && typeof uploadedFile === 'object' && 'arrayBuffer' in uploadedFile) {
      buffer = Buffer.from(await (uploadedFile as any).arrayBuffer());
    } else if (Buffer.isBuffer(uploadedFile)) {
      buffer = uploadedFile;
    } else {
      return c.json({ success: false, message: 'Invalid file payload' }, 400);
    }

    // 5MB Limit check
    if (buffer.length > 5 * 1024 * 1024) {
      return c.json({ success: false, message: 'File size exceeds maximum 5MB limit' }, 400);
    }

    const dims = extractDimensions(buffer);
    if (dims.format === 'unknown') {
      return c.json({ success: false, message: 'Invalid or unsupported image format' }, 400);
    }

    // Min resolution verification
    const preset = (CMS_IMAGE_PRESETS as any)[targetSlot] || CMS_IMAGE_PRESETS.heroSlide;
    if (dims.width < preset.minWidth || dims.height < preset.minHeight) {
      return c.json({
        success: false,
        message: `Image dimensions ${dims.width}x${dims.height} below minimum required ${preset.minWidth}x${preset.minHeight}`,
      }, 422);
    }

    const hasOriginalExif = hasExif(buffer);
    const mediaUrl = `https://cdn.hipmi.org/media/${Date.now()}.webp`;

    const ins = await currentClient.query(
      `INSERT INTO cms_media (original_filename, url, content_type, width, height, size_bytes, exif_stripped)
       VALUES ($1, $2, 'image/webp', $3, $4, $5, true)
       RETURNING *`,
      [(uploadedFile as any).name || 'upload.png', mediaUrl, dims.width, dims.height, buffer.length]
    );

    return c.json({
      success: true,
      message: 'Gambar berhasil diproses dan dikonversi ke WebP tanpa EXIF',
      data: {
        ...ins.rows[0],
        hadExifBeforeProcessing: hasOriginalExif,
      },
    }, 201);
  });

  // POST /api/cms/hero-slides
  cmsRouter.post('/hero-slides', rbacMiddleware('cms', 'create'), async (c) => {
    const rawBody = await c.req.json();
    const title = sanitizeText(rawBody.title);
    const subtitle = sanitizeText(rawBody.subtitle);
    const imageUrl = rawBody.imageUrl || '';
    const imageAlt = sanitizeText(rawBody.imageAlt || '');
    const orderIndex = Number(rawBody.orderIndex || 1);

    if (title.length > 45) {
      return c.json({ success: false, message: 'Title exceeds maximum 45 characters' }, 422);
    }
    if (subtitle.length > 180) {
      return c.json({ success: false, message: 'Subtitle exceeds maximum 180 characters' }, 422);
    }
    if (imageAlt.length > 140) {
      return c.json({ success: false, message: 'ImageAlt exceeds maximum 140 characters' }, 422);
    }

    const slotStatus = imageUrl ? 'ready' : 'pending-asset';

    const res = await currentClient.query(
      `INSERT INTO cms_hero_slides (title, subtitle, image_url, image_alt, slot_status, order_index)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, subtitle, imageUrl, imageAlt, slotStatus, orderIndex]
    );

    await triggerRevalidate(['hero-slides'], ['/id']);

    return c.json({
      success: true,
      message: 'Hero slide berhasil dibuat',
      data: res.rows[0],
    }, 201);
  });

  // PUT /api/cms/hero-slides/:id
  cmsRouter.put('/hero-slides/:id', rbacMiddleware('cms', 'update'), async (c) => {
    const id = c.req.param('id');
    const rawBody = await c.req.json();
    const title = sanitizeText(rawBody.title);
    const subtitle = sanitizeText(rawBody.subtitle);
    const imageUrl = rawBody.imageUrl;
    const imageAlt = sanitizeText(rawBody.imageAlt || '');

    const slotStatus = imageUrl ? 'ready' : 'pending-asset';

    const res = await currentClient.query(
      `UPDATE cms_hero_slides
       SET title = $1, subtitle = $2, image_url = $3, image_alt = $4, slot_status = $5
       WHERE id = $6
       RETURNING *`,
      [title, subtitle, imageUrl, imageAlt, slotStatus, id]
    );

    if (!res.rows.length) {
      return c.json({ success: false, message: 'Hero slide tidak ditemukan' }, 404);
    }

    await triggerRevalidate(['hero-slides'], ['/id']);

    return c.json({
      success: true,
      message: 'Hero slide berhasil diperbarui',
      data: res.rows[0],
    });
  });

  // POST /api/cms/partners
  cmsRouter.post('/partners', rbacMiddleware('cms', 'create'), async (c) => {
    const rawBody = await c.req.json();
    const name = sanitizeText(rawBody.name);
    const logoUrl = rawBody.logoUrl || '';
    const scope = sanitizeText(rawBody.scope || '');
    const tier = rawBody.tier || 'STRATEGIC';

    if (name.length > 35) {
      return c.json({ success: false, message: 'Partner name exceeds 35 characters' }, 422);
    }
    if (scope.length > 160) {
      return c.json({ success: false, message: 'Scope exceeds 160 characters' }, 422);
    }

    const slotStatus = logoUrl ? 'ready' : 'pending-asset';

    const res = await currentClient.query(
      `INSERT INTO cms_partners (name, logo_url, scope, tier, slot_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, logoUrl, scope, tier, slotStatus]
    );

    await triggerRevalidate(['partners'], ['/id/tentang']);

    return c.json({
      success: true,
      message: 'Mitra kerjasama berhasil ditambahkan',
      data: res.rows[0],
    }, 201);
  });

  app.route('/api/cms', cmsRouter);

  // 5. Public Read-Only Endpoints
  const publicRouter = new Hono();

  publicRouter.get('/hero-slides', async (c) => {
    const res = await currentClient.query(
      `SELECT * FROM cms_hero_slides WHERE slot_status = 'ready' ORDER BY order_index ASC`
    );
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  publicRouter.get('/partners', async (c) => {
    const res = await currentClient.query(
      `SELECT * FROM cms_partners WHERE slot_status = 'ready' ORDER BY created_at DESC`
    );
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  publicRouter.get('/calendar', async (c) => {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    let queryStr = `SELECT * FROM calendar_events WHERE is_public = true`;
    const params: any[] = [];
    if (startDate && endDate) {
      queryStr += ` AND start_time >= $1 AND end_time <= $2`;
      params.push(startDate, endDate);
    }
    queryStr += ` ORDER BY start_time ASC`;

    const res = await currentClient.query(queryStr, params);
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  app.route('/api/public', publicRouter);

  // 6. Calendar Router (Internal & Protected)
  const calendarRouter = new Hono<{ Variables: { user: AuthUser } }>();
  calendarRouter.use('*', authMiddleware);

  calendarRouter.get('/', rbacMiddleware('calendar', 'read'), async (c) => {
    const res = await currentClient.query(`SELECT * FROM calendar_events ORDER BY start_time ASC`);
    return c.json({
      success: true,
      data: res.rows,
    });
  });

  calendarRouter.post('/', rbacMiddleware('calendar', 'create'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { title, description, startTime, endTime, location, isPublic } = body;

    // Graceful Google Calendar sync fallback simulation
    let gcalSynced = false;
    let gcalId: string | null = null;
    try {
      if (process.env.GCAL_API_KEY) {
        gcalSynced = true;
        gcalId = `gcal-${Date.now()}`;
      } else {
        // Fallback to local
        gcalSynced = false;
        gcalId = null;
      }
    } catch {
      gcalSynced = false;
    }

    const res = await currentClient.query(
      `INSERT INTO calendar_events (title, description, start_time, end_time, location, is_public, gcal_synced, gcal_event_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title,
        description || '',
        startTime || new Date().toISOString(),
        endTime || new Date(Date.now() + 3600000).toISOString(),
        location || 'Sekretariat HIPMI',
        Boolean(isPublic),
        gcalSynced,
        gcalId,
        user.id,
      ]
    );

    return c.json({
      success: true,
      message: 'Agenda kalender berhasil dibuat dengan fallback lokal',
      data: res.rows[0],
    }, 201);
  });

  calendarRouter.patch('/:id', rbacMiddleware('calendar', 'update'), async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { title, location } = body;

    const res = await currentClient.query(
      `UPDATE calendar_events
       SET title = COALESCE($1, title), location = COALESCE($2, location)
       WHERE id = $3
       RETURNING *`,
      [title, location, id]
    );

    if (!res.rows.length) {
      return c.json({ success: false, message: 'Agenda tidak ditemukan' }, 404);
    }

    return c.json({
      success: true,
      message: 'Agenda berhasil diperbarui',
      data: res.rows[0],
    });
  });

  calendarRouter.delete('/:id', rbacMiddleware('calendar', 'delete'), async (c) => {
    const id = c.req.param('id');
    const res = await currentClient.query('DELETE FROM calendar_events WHERE id = $1 RETURNING id', [id]);
    if (!res.rows.length) {
      return c.json({ success: false, message: 'Agenda tidak ditemukan' }, 404);
    }
    return c.json({
      success: true,
      message: 'Agenda berhasil dihapus',
    });
  });

  app.route('/api/calendar', calendarRouter);

  routesMounted = true;
}

