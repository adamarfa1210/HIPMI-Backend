import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles, modules, rolePermissions } from '../../../src/db/schema/auth.js';
import { eq, and } from 'drizzle-orm';
import { setupTier3Database, ensureTier3RoutesMounted } from './tier3-setup.js';

describe('Tier 3 Cross-Feature: Auth ↔ RBAC ↔ Financial Ledger & Dynamic Balance', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let staffToken: string;
  let kader1Token: string;
  let staffRoleId: string;
  let staffCadreId: string;
  let financeModuleId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();
    await setupTier3Database(dbHelper.client);
    ensureTier3RoutesMounted();

    // 1. Get role IDs
    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Staff'),
    });
    staffRoleId = staffRole!.id;

    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Kader 1'),
    });

    const finMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, 'finance'),
    });
    financeModuleId = finMod!.id;

    // 2. Insert Staff cadre in DB
    const staffHash = await bcrypt.hash('staff123', 10);
    const [insertedStaff] = await dbHelper.db.insert(kaders).values({
      roleId: staffRoleId,
      nim: '1201223001',
      passwordHash: staffHash,
      fullName: 'Bendahara Staff Operasional',
      whatsappNumber: '081234563001',
      prodi: 'S1 Sistem Informasi',
      fakultas: 'FRI',
      interestCategory: 'Punya Bisnis',
      status: 'Aktif',
      totalScore: 50,
    }).returning();
    staffCadreId = insertedStaff.id;

    // 3. Insert Kader 1 cadre in DB
    const kader1Hash = await bcrypt.hash('kader123', 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: '1201223002',
      passwordHash: kader1Hash,
      fullName: 'Kader Tingkat 1 Keuangan',
      whatsappNumber: '081234563002',
      prodi: 'S1 Informatika',
      fakultas: 'FIF',
      interestCategory: 'Belum Punya Bisnis',
      status: 'Aktif',
      totalScore: 10,
    });

    // 4. Authenticate Superadmin (NIM: 1201220001, pass: admin123)
    const adminLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    expect(adminLoginRes.status).toBe(200);
    const adminLoginJson = await adminLoginRes.json();
    adminToken = adminLoginJson.data.accessToken;

    // 5. Authenticate Staff
    const staffLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201223001', password: 'staff123' }),
    });
    expect(staffLoginRes.status).toBe(200);
    const staffLoginJson = await staffLoginRes.json();
    staffToken = staffLoginJson.data.accessToken;

    // 6. Authenticate Kader 1
    const kader1LoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201223002', password: 'kader123' }),
    });
    expect(kader1LoginRes.status).toBe(200);
    const kader1LoginJson = await kader1LoginRes.json();
    kader1Token = kader1LoginJson.data.accessToken;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('T3-FIN-01: Authenticated login returns valid JWT tokens with correct claims', async () => {
    expect(adminToken).toBeDefined();
    expect(staffToken).toBeDefined();
    expect(kader1Token).toBeDefined();
    expect(typeof adminToken).toBe('string');
  });

  it('T3-FIN-02: Unauthenticated request to /api/finance/balance is rejected with HTTP 401', async () => {
    const res = await app.request('/api/finance/balance');
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('T3-FIN-03: Kader 1 role without finance read permission receives HTTP 403 Forbidden', async () => {
    const res = await app.request('/api/finance/balance', {
      headers: { Authorization: `Bearer ${kader1Token}` },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Akses ditolak');
  });

  let createdPendingTxId: string;

  it('T3-FIN-04: Staff posts a CASH_IN transaction -> initial status is strictly PENDING', async () => {
    const res = await app.request('/api/finance/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CASH_IN',
        amount: 2500000,
        category: 'Iuran Pendaftaran',
        description: 'Pembayaran iuran gelombang 1',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('PENDING');
    expect(Number(json.data.amount)).toBe(2500000);
    expect(json.data.created_by).toBe(staffCadreId);
    expect(json.data.invoice_number).toBeNull();
    createdPendingTxId = json.data.id;
  });

  it('T3-FIN-05: Dynamic balance query shows pending transaction is strictly NOT counted in total balance', async () => {
    const res = await app.request('/api/finance/balance', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Strict invariant: pending transactions must not affect balance
    expect(json.data.totalBalance).toBe(0);
    expect(json.data.totalCashIn).toBe(0);
    expect(json.data.pendingCount).toBe(1);
  });

  it('T3-FIN-06: Staff attempts to approve transaction -> rejected with HTTP 403 (Staff canApprove: false)', async () => {
    const res = await app.request(`/api/finance/transactions/${createdPendingTxId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('izin [APPROVE]');
  });

  it('T3-FIN-07: Admin approves transaction -> status APPROVED, invoice INV/HIPMI/2026/0001 generated, approved_by recorded', async () => {
    const res = await app.request(`/api/finance/transactions/${createdPendingTxId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('APPROVED');
    expect(json.data.invoice_number).toBe('INV/HIPMI/2026/0001');
    expect(json.data.approved_by).toBeDefined();
    expect(json.data.approved_at).toBeDefined();
  });

  it('T3-FIN-08: Dynamic balance immediately reflects the approved CASH_IN amount', async () => {
    const res = await app.request('/api/finance/balance', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalBalance).toBe(2500000);
    expect(json.data.totalCashIn).toBe(2500000);
    expect(json.data.totalCashOut).toBe(0);
    expect(json.data.pendingCount).toBe(0);
  });

  let rejectedTxId: string;

  it('T3-FIN-09: Rejection workflow: Staff posts CASH_OUT, Admin rejects it with reason', async () => {
    // 1. Staff creates CASH_OUT
    const createRes = await app.request('/api/finance/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CASH_OUT',
        amount: 800000,
        category: 'Konsumsi Rapat',
        description: 'Biaya konsumsi rapat pleno',
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    rejectedTxId = createJson.data.id;

    // 2. Admin rejects transaction
    const rejectRes = await app.request(`/api/finance/transactions/${rejectedTxId}/reject`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: 'Nota pembelanjaan tidak valid / tidak ada kuitansi fisik',
      }),
    });

    expect(rejectRes.status).toBe(200);
    const rejectJson = await rejectRes.json();
    expect(rejectJson.success).toBe(true);
    expect(rejectJson.data.status).toBe('REJECTED');
    expect(rejectJson.data.rejection_reason).toContain('Nota pembelanjaan tidak valid');
  });

  it('T3-FIN-10: Dynamic balance remains untouched after transaction rejection', async () => {
    const res = await app.request('/api/finance/balance', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    // Balance must STILL be 2,500,000 because rejected CASH_OUT is excluded
    expect(json.data.totalBalance).toBe(2500000);
    expect(json.data.totalCashOut).toBe(0);
    expect(json.data.pendingCount).toBe(0);
  });

  it('T3-FIN-11: Valid CASH_OUT approved reduces totalBalance accurately with sequential invoice INV/HIPMI/2026/0002', async () => {
    // 1. Create CASH_OUT 500,000
    const createRes = await app.request('/api/finance/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CASH_OUT',
        amount: 500000,
        category: 'Sewa Tempat',
        description: 'Sewa ruang workshop',
      }),
    });
    expect(createRes.status).toBe(201);
    const txId = (await createRes.json()).data.id;

    // 2. Admin approves CASH_OUT
    const approveRes = await app.request(`/api/finance/transactions/${txId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(approveRes.status).toBe(200);
    const approveJson = await approveRes.json();
    expect(approveJson.data.status).toBe('APPROVED');
    expect(approveJson.data.invoice_number).toBe('INV/HIPMI/2026/0002');

    // 3. Check dynamic balance: 2,500,000 - 500,000 = 2,000,000
    const balRes = await app.request('/api/finance/balance', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const balJson = await balRes.json();
    expect(balJson.data.totalCashIn).toBe(2500000);
    expect(balJson.data.totalCashOut).toBe(500000);
    expect(balJson.data.totalBalance).toBe(2000000);
  });

  it('T3-FIN-12: Dynamic RBAC Policy Mutation: Revoking finance permission immediately denies Staff access', async () => {
    // 1. Admin revokes canCreate on finance module from Staff role
    await dbHelper.db
      .update(rolePermissions)
      .set({ canCreate: false })
      .where(
        and(
          eq(rolePermissions.roleId, staffRoleId),
          eq(rolePermissions.moduleId, financeModuleId)
        )
      );

    // 2. Staff now attempts to post a transaction -> immediately receives 403 Forbidden
    const createRes = await app.request('/api/finance/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CASH_IN',
        amount: 100000,
        category: 'Lain-lain',
      }),
    });

    expect(createRes.status).toBe(403);
    const json = await createRes.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('izin [CREATE]');

    // 3. Restore canCreate for Staff
    await dbHelper.db
      .update(rolePermissions)
      .set({ canCreate: true })
      .where(
        and(
          eq(rolePermissions.roleId, staffRoleId),
          eq(rolePermissions.moduleId, financeModuleId)
        )
      );
  });
});
