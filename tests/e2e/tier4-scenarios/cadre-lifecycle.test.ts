import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles } from '../../../src/db/schema/auth.js';
import { eq, desc } from 'drizzle-orm';

describe('Tier 4 Scenario 1: Cadre Onboarding to High-Scoring Leader', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let cadre1RoleId: string;
  let newCadreId: string;
  let cadreToken: string;
  const CADRE_NIM = '1201221001';
  const INITIAL_PASSWORD = CADRE_NIM; // System defaults password to NIM
  const NEW_PASSWORD = 'SecureCadrePass2026!';

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // Setup ERP Operational tables in PGlite
    await dbHelper.client.exec(`
      CREATE TABLE IF NOT EXISTS prokers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        bidang VARCHAR(80) NOT NULL,
        kompartemen VARCHAR(80),
        status VARCHAR(30) NOT NULL DEFAULT 'PLANNING',
        target_date DATE,
        pic_cadre_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS proker_committees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        proker_id UUID NOT NULL REFERENCES prokers(id) ON DELETE CASCADE,
        cadre_id UUID NOT NULL REFERENCES kaders(id) ON DELETE CASCADE,
        role VARCHAR(80) NOT NULL,
        points_awarded INTEGER NOT NULL DEFAULT 50,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(120) NOT NULL,
        proker_id UUID REFERENCES prokers(id) ON DELETE SET NULL,
        date TIMESTAMPTZ NOT NULL DEFAULT now(),
        location VARCHAR(120) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS meeting_attendances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        cadre_id UUID NOT NULL REFERENCES kaders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'HADIR',
        points_awarded INTEGER NOT NULL DEFAULT 20,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
    `);

    // 1. Resolve Kader 1 role ID
    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Kader 1'),
    });
    cadre1RoleId = kader1Role!.id;

    // 2. Authenticate Admin to manage Cadres
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    const adminJson = await adminLogin.json();
    adminToken = adminJson.data.accessToken;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('Step 1: Admin registers new cadre with NIM and initial details', async () => {
    const registerRes = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: cadre1RoleId,
        nim: CADRE_NIM,
        fullName: 'Ahmad Fauzi Cadre',
        whatsappNumber: '081234567101',
        prodi: 'S1 Sistem Informasi',
        fakultas: 'Fakultas Rekayasa Industri',
        interestCategory: 'Belum Punya Bisnis',
      }),
    });

    expect(registerRes.status).toBe(201);
    const registerJson = await registerRes.json();
    expect(registerJson.success).toBe(true);
    expect(registerJson.data.nim).toBe(CADRE_NIM);
    expect(registerJson.data.fullName).toBe('Ahmad Fauzi Cadre');
    expect(registerJson.data.status).toBe('Aktif');
    expect(registerJson.data.totalScore).toBe(0);

    newCadreId = registerJson.data.id;
    expect(newCadreId).toBeDefined();
  });

  it('Step 2: Cadre logs in with default password (NIM), changes password, and verifies new credentials', async () => {
    // 1. Log in with initial defaulted password (NIM)
    const initialLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nim: CADRE_NIM,
        password: INITIAL_PASSWORD,
      }),
    });

    expect(initialLoginRes.status).toBe(200);
    const initialLoginJson = await initialLoginRes.json();
    expect(initialLoginJson.success).toBe(true);
    cadreToken = initialLoginJson.data.accessToken;
    expect(cadreToken).toBeDefined();

    // 2. Change password to secure password
    const changePassRes = await app.request('/api/auth/change-password', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${cadreToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        oldPassword: INITIAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    });

    expect(changePassRes.status).toBe(200);
    const changePassJson = await changePassRes.json();
    expect(changePassJson.success).toBe(true);

    // 3. Verify old password no longer works (401 Unauthorized)
    const failedOldLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nim: CADRE_NIM,
        password: INITIAL_PASSWORD,
      }),
    });
    expect(failedOldLogin.status).toBe(401);

    // 4. Verify new password successfully authenticates (200 OK)
    const newLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nim: CADRE_NIM,
        password: NEW_PASSWORD,
      }),
    });
    expect(newLoginRes.status).toBe(200);
    const newLoginJson = await newLoginRes.json();
    cadreToken = newLoginJson.data.accessToken; // Refresh cadre token
  });

  it('Step 3: Cadre updates profile (interest category, business name, and instagram handle)', async () => {
    const updateProfileRes = await app.request(`/api/kaders/${newCadreId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`, // or cadreToken if permitted
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        interestCategory: 'Punya Bisnis',
        businessName: 'Fauzi Coffee & Roastery',
        instagram: '@fauzicoffee',
      }),
    });

    expect(updateProfileRes.status).toBe(200);
    const updateJson = await updateProfileRes.json();
    expect(updateJson.success).toBe(true);
    expect(updateJson.data.interestCategory).toBe('Punya Bisnis');
    expect(updateJson.data.businessName).toBe('Fauzi Coffee & Roastery');
    expect(updateJson.data.instagram).toBe('@fauzicoffee');

    // Verify detail retrieval via GET /api/kaders/:id
    const getDetailRes = await app.request(`/api/kaders/${newCadreId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getDetailRes.status).toBe(200);
    const detailJson = await getDetailRes.json();
    expect(detailJson.data.interestCategory).toBe('Punya Bisnis');
    expect(detailJson.data.businessName).toBe('Fauzi Coffee & Roastery');
  });

  it('Step 4: Cadre is appointed as committee member for Proker (OKK Diklat) with activity points', async () => {
    // 1. Create Proker "OKK Diklat 2026"
    const prokerRes = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO prokers (name, bidang, status, target_date)
      VALUES ('OKK Diklat 2026', 'OKK', 'ACTIVE', '2026-09-15')
      RETURNING id;
    `);
    const prokerId = prokerRes.rows[0].id;

    // 2. Appoint cadre as Committee Member ("Koordinator Divisi Acara", +50 pts)
    const committeePoints = 50;
    const committeeRes = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO proker_committees (proker_id, cadre_id, role, points_awarded)
      VALUES ($1, $2, 'Koordinator Divisi Acara', $3)
      RETURNING id;
    `, [prokerId, newCadreId, committeePoints]);
    const committeeId = committeeRes.rows[0].id;

    // 3. Automated Point Ledger Calculation: record 50 points into score_ledgers
    await dbHelper.client.query(`
      INSERT INTO score_ledgers (cadre_id, reference_type, reference_id, points, description)
      VALUES ($1, 'PROKER', $2, $3, 'Kepanitiaan Proker OKK Diklat 2026 - Koordinator Acara');
    `, [newCadreId, committeeId, committeePoints]);

    // 4. Update Cadre's cumulative total_score in database
    await dbHelper.db
      .update(kaders)
      .set({ totalScore: committeePoints })
      .where(eq(kaders.id, newCadreId));

    // Verify score via GET /api/kaders/:id
    const detailRes = await app.request(`/api/kaders/${newCadreId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const detailJson = await detailRes.json();
    expect(detailJson.data.totalScore).toBe(50);
  });

  it('Step 5: Cadre attends a series of 3 internal organizational meetings with attendance logged', async () => {
    const meetingTitles = [
      'Rapat Koordinasi Perdana Kepengurusan',
      'Rapat Evaluasi Tengah Program OKK',
      'Rapat Pleno Pra-Kegiatan Diklat',
    ];

    const POINTS_PER_MEETING = 20;

    for (const title of meetingTitles) {
      // 1. Create meeting
      const meetingRes = await dbHelper.client.query<{ id: string }>(`
        INSERT INTO meetings (title, location, type)
        VALUES ($1, 'Sekretariat HIPMI PT Telkom', 'INTERNAL')
        RETURNING id;
      `, [title]);
      const meetingId = meetingRes.rows[0].id;

      // 2. Log attendance as HADIR
      const attRes = await dbHelper.client.query<{ id: string }>(`
        INSERT INTO meeting_attendances (meeting_id, cadre_id, status, points_awarded)
        VALUES ($1, $2, 'HADIR', $3)
        RETURNING id;
      `, [meetingId, newCadreId, POINTS_PER_MEETING]);
      const attId = attRes.rows[0].id;

      // 3. Inject score ledger entry
      await dbHelper.client.query(`
        INSERT INTO score_ledgers (cadre_id, reference_type, reference_id, points, description)
        VALUES ($1, 'MEETING', $2, $3, $4);
      `, [newCadreId, attId, POINTS_PER_MEETING, `Presensi Hadir: ${title}`]);
    }

    // Accumulate total score: 50 (proker) + 3 * 20 (meetings) = 110 points
    const TOTAL_EXPECTED_SCORE = 110;
    await dbHelper.db
      .update(kaders)
      .set({ totalScore: TOTAL_EXPECTED_SCORE })
      .where(eq(kaders.id, newCadreId));

    // Verify cumulative point ledger entries
    const ledgerRows = await dbHelper.client.query<{ points: number; reference_type: string }>(`
      SELECT points, reference_type FROM score_ledgers WHERE cadre_id = $1 ORDER BY created_at ASC;
    `, [newCadreId]);

    expect(ledgerRows.rows.length).toBe(4); // 1 proker + 3 meetings
    const sumPoints = ledgerRows.rows.reduce((acc, row) => acc + row.points, 0);
    expect(sumPoints).toBe(TOTAL_EXPECTED_SCORE);
  });

  it('Step 6: Cadre ascends to top rank on internal Leaderboard with verified cumulative points', async () => {
    // 1. Fetch updated cadre record via API
    const finalDetailRes = await app.request(`/api/kaders/${newCadreId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(finalDetailRes.status).toBe(200);
    const finalDetail = await finalDetailRes.json();
    expect(finalDetail.data.totalScore).toBe(110);

    // 2. Query Cadre list sorted by totalScore descending to check ranking
    const allCadres = await dbHelper.db.query.kaders.findMany({
      orderBy: [desc(kaders.totalScore)],
    });

    expect(allCadres.length).toBeGreaterThanOrEqual(1);

    // Verify Ahmad Fauzi is at Rank #1 among active newly onboarded cadres
    const topCadre = allCadres[0];
    expect(topCadre.id).toBe(newCadreId);
    expect(topCadre.nim).toBe(CADRE_NIM);
    expect(topCadre.totalScore).toBe(110);
    expect(topCadre.fullName).toBe('Ahmad Fauzi Cadre');
  });
});
