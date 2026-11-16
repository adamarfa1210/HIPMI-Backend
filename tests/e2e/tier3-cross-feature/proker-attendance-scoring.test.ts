import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles, modules } from '../../../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';
import { setupTier3Database, ensureTier3RoutesMounted } from './tier3-setup.js';

describe('Tier 3 Cross-Feature: Proker ↔ Attendance ↔ Transparent Scoring ↔ Leaderboard', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let kabidToken: string;
  let kader1Token: string;
  let cadreAId: string;
  let cadreBId: string;
  let cadreCId: string;
  let prokerId: string;
  let meetingId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();
    await setupTier3Database(dbHelper.client);
    ensureTier3RoutesMounted();

    const kabidRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Kabid'),
    });
    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Kader 1'),
    });

    // Create 3 active cadres with initial score 0
    const pwdHash = await bcrypt.hash('kader123', 10);

    const [cA] = await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: '1201224001',
      passwordHash: pwdHash,
      fullName: 'Cadre Alpha Juara',
      whatsappNumber: '081234564001',
      prodi: 'S1 Informatika',
      fakultas: 'FIF',
      interestCategory: 'Punya Bisnis',
      status: 'Aktif',
      totalScore: 0,
    }).returning();
    cadreAId = cA.id;

    const [cB] = await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: '1201224002',
      passwordHash: pwdHash,
      fullName: 'Cadre Beta Runnerup',
      whatsappNumber: '081234564002',
      prodi: 'S1 Teknik Industri',
      fakultas: 'FRI',
      interestCategory: 'Kompetisi',
      status: 'Aktif',
      totalScore: 0,
    }).returning();
    cadreBId = cB.id;

    const [cC] = await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: '1201224003',
      passwordHash: pwdHash,
      fullName: 'Cadre Gamma Anggota',
      whatsappNumber: '081234564003',
      prodi: 'S1 Desain Komunikasi Visual',
      fakultas: 'FIK',
      interestCategory: 'Belum Punya Bisnis',
      status: 'Aktif',
      totalScore: 0,
    }).returning();
    cadreCId = cC.id;

    // Create Kabid OKK
    const [insertedKabid] = await dbHelper.db.insert(kaders).values({
      roleId: kabidRole!.id,
      nim: '1201224099',
      passwordHash: pwdHash,
      fullName: 'Kabid OKK HIPMI',
      whatsappNumber: '081234564099',
      prodi: 'S1 Manajemen Bisnis',
      fakultas: 'FEB',
      interestCategory: 'Punya Bisnis',
      status: 'Aktif',
      totalScore: 100,
    }).returning();

    // Authenticate Admin
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    adminToken = (await adminLogin.json()).data.accessToken;

    // Authenticate Kabid
    const kabidLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201224099', password: 'kader123' }),
    });
    kabidToken = (await kabidLogin.json()).data.accessToken;

    // Authenticate Kader 1 (Cadre A)
    const kaderLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201224001', password: 'kader123' }),
    });
    kader1Token = (await kaderLogin.json()).data.accessToken;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('T3-SCORE-01: Admin creates work program (Proker) under Bidang OKK', async () => {
    const res = await app.request('/api/tracking/prokers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HIPMI Fest & Entrepreneur Expo 2026',
        bidang: 'Bidang OKK',
        kompartemen: 'Kaderisasi',
        targetDate: '2026-11-20',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('HIPMI Fest & Entrepreneur Expo 2026');
    expect(json.data.bidang).toBe('Bidang OKK');
    expect(json.data.status).toBe('ACTIVE');
    prokerId = json.data.id;
  });

  it('T3-SCORE-02: Cadre A assigned as Ketua Pelaksana -> receives +50 committee points in transparent ledger', async () => {
    const res = await app.request(`/api/tracking/prokers/${prokerId}/committees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cadreId: cadreAId,
        role: 'Ketua Pelaksana Proker',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.points_awarded).toBe(50);

    // Verify transparent score ledger
    const ledgerRes = await app.request(`/api/tracking/scores/${cadreAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ledgerJson = await ledgerRes.json();
    expect(ledgerJson.data.length).toBe(1);
    expect(ledgerJson.data[0].points).toBe(50);
    expect(ledgerJson.data[0].reference_type).toBe('PROKER');
    expect(ledgerJson.data[0].reference_id).toBe(prokerId);
  });

  it('T3-SCORE-03: Cadre B (Sekretaris, +30) and Cadre C (Anggota, +20) assigned as committees', async () => {
    // Cadre B
    const resB = await app.request(`/api/tracking/prokers/${prokerId}/committees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cadreId: cadreBId,
        role: 'Sekretaris Pelaksana',
      }),
    });
    expect(resB.status).toBe(201);
    expect((await resB.json()).data.points_awarded).toBe(30);

    // Cadre C
    const resC = await app.request(`/api/tracking/prokers/${prokerId}/committees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cadreId: cadreCId,
        role: 'Anggota Divisi Logistik',
      }),
    });
    expect(resC.status).toBe(201);
    expect((await resC.json()).data.points_awarded).toBe(20);
  });

  it('T3-SCORE-04: Cadres total_score in kaders table synchronized with committee awards', async () => {
    const cARecord = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreAId) });
    const cBRecord = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreBId) });
    const cCRecord = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreCId) });

    expect(cARecord!.totalScore).toBe(50);
    expect(cBRecord!.totalScore).toBe(30);
    expect(cCRecord!.totalScore).toBe(20);
  });

  it('T3-SCORE-05: Kabid OKK schedules meeting session for Proker', async () => {
    const res = await app.request('/api/tracking/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Rapat Koordinasi Perdana HIPMI Fest',
        prokerId,
        date: new Date().toISOString(),
        location: 'Ruang Rapat Gedung Kuliah Bersama',
        type: 'PROKER',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Rapat Koordinasi Perdana HIPMI Fest');
    meetingId = json.data.id;
  });

  it('T3-SCORE-06: Bulk attendance logged: HADIR cadres receive +10 attendance points, IZIN receives 0', async () => {
    const res = await app.request(`/api/tracking/meetings/${meetingId}/attendance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendances: [
          { cadreId: cadreAId, status: 'HADIR' }, // +10 (total 60)
          { cadreId: cadreBId, status: 'HADIR' }, // +10 (total 40)
          { cadreId: cadreCId, status: 'IZIN' },  // 0  (total 20)
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify Cadre A updated score = 60
    const cA = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreAId) });
    expect(cA!.totalScore).toBe(60);

    // Verify Cadre B updated score = 40
    const cB = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreBId) });
    expect(cB!.totalScore).toBe(40);

    // Verify Cadre C score stays 20
    const cC = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreCId) });
    expect(cC!.totalScore).toBe(20);
  });

  it('T3-SCORE-07: Real-time leaderboard query reflects updated total scores and relative ranks', async () => {
    const res = await app.request('/api/leaderboard', {
      headers: { Authorization: `Bearer ${kader1Token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const data: any[] = json.data;
    const rankA = data.find((c) => c.id === cadreAId);
    const rankB = data.find((c) => c.id === cadreBId);
    const rankC = data.find((c) => c.id === cadreCId);

    expect(rankA.total_score).toBe(60);
    expect(rankB.total_score).toBe(40);
    expect(rankC.total_score).toBe(20);

    // Rank of Cadre A must be higher (smaller number) than Cadre B and C
    expect(rankA.rank).toBeLessThan(rankB.rank);
    expect(rankB.rank).toBeLessThan(rankC.rank);
  });

  it('T3-SCORE-08: Attendance status changed from HADIR to ALPHA -> negative compensating transaction (-10 pts) entered in score ledger', async () => {
    // Cadre B was marked HADIR (+10), now amended to ALPHA
    const res = await app.request(`/api/tracking/meetings/${meetingId}/attendance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendances: [
          { cadreId: cadreBId, status: 'ALPHA' },
        ],
      }),
    });

    expect(res.status).toBe(200);

    // Verify transparent score ledger contains negative compensating transaction
    const ledgerRes = await app.request(`/api/tracking/scores/${cadreBId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ledgerJson = await ledgerRes.json();
    const ledgerEntries: any[] = ledgerJson.data;

    // Must have the committee entry (+30), the original attendance (+10), and the compensating (-10)
    expect(ledgerEntries.length).toBe(3);
    const compensating = ledgerEntries.find((e) => e.points === -10);
    expect(compensating).toBeDefined();
    expect(compensating.description).toContain('Koreksi Presensi Rapat');

    // Cadre B total score in kaders table is reduced to 30
    const cB = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreBId) });
    expect(cB!.totalScore).toBe(30);
  });

  it('T3-SCORE-09: Dynamic leaderboard dynamically re-ranks cadres after compensating deduction', async () => {
    const res = await app.request('/api/leaderboard', {
      headers: { Authorization: `Bearer ${kader1Token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    const data: any[] = json.data;

    const rankA = data.find((c) => c.id === cadreAId);
    const rankB = data.find((c) => c.id === cadreBId);
    const rankC = data.find((c) => c.id === cadreCId);

    expect(rankA.total_score).toBe(60);
    expect(rankB.total_score).toBe(30);
    expect(rankC.total_score).toBe(20);

    expect(rankA.rank).toBeLessThan(rankB.rank);
    expect(rankB.rank).toBeLessThan(rankC.rank);
  });

  it('T3-SCORE-10: Idempotent attendance submission without status change does not duplicate points', async () => {
    // Submit identical status (ALPHA for Cadre B)
    await app.request(`/api/tracking/meetings/${meetingId}/attendance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendances: [{ cadreId: cadreBId, status: 'ALPHA' }],
      }),
    });

    const cB = await dbHelper.db.query.kaders.findFirst({ where: eq(kaders.id, cadreBId) });
    // Total score must still remain 30 (not deducted again)
    expect(cB!.totalScore).toBe(30);
  });

  it('T3-SCORE-11: Unauthorized cadre (Kader 1) cannot schedule meetings or log attendance (HTTP 403)', async () => {
    const res = await app.request('/api/tracking/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kader1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Rapat Ilegal',
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
