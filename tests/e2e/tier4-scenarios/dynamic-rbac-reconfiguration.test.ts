import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles, modules } from '../../../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';

describe('Tier 4 Scenario 5: Dynamic RBAC Delegation & Self-Preservation', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let staffToken: string;
  let adminRoleId: string;
  let staffRoleId: string;
  let kadersModuleId: string;
  let adminRbacModuleId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // 1. Resolve Admin & Staff Roles
    const adminRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Admin'),
    });
    adminRoleId = adminRole!.id;

    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Staff'),
    });
    staffRoleId = staffRole!.id;

    // 2. Resolve Modules
    const kadersMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, 'kaders'),
    });
    kadersModuleId = kadersMod!.id;

    const adminRbacMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, 'admin-rbac'),
    });
    adminRbacModuleId = adminRbacMod!.id;

    // 3. Create Staff User for testing
    const staffPasswordHash = await bcrypt.hash('staff123', 10);
    await dbHelper.db.insert(kaders).values({
      roleId: staffRoleId,
      nim: '1201220055',
      passwordHash: staffPasswordHash,
      fullName: 'Staff Organisasi Operasional',
      whatsappNumber: '081234567055',
      prodi: 'S1 Sistem Informasi',
      fakultas: 'Fakultas Rekayasa Industri',
      interestCategory: 'Punya Bisnis',
      status: 'Aktif',
      totalScore: 50,
    });

    // 4. Authenticate Admin and Staff
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    const adminJson = await adminLogin.json();
    adminToken = adminJson.data.accessToken;

    const staffLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220055', password: 'staff123' }),
    });
    const staffJson = await staffLogin.json();
    staffToken = staffJson.data.accessToken;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('Step 1: Admin inspects RBAC matrix and confirms Staff initially cannot create cadres', async () => {
    // 1. Admin inspects matrix
    const matrixRes = await app.request('/api/admin/rbac/matrix', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(matrixRes.status).toBe(200);
    const matrixJson = await matrixRes.json();
    expect(matrixJson.success).toBe(true);
    expect(Array.isArray(matrixJson.data.matrix)).toBe(true);

    // 2. Staff user can read cadres
    const readRes = await app.request('/api/kaders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(readRes.status).toBe(200);

    // 3. Staff user attempts to create cadre -> Denied 403 Forbidden
    const createAttempt = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: '1201220056',
        fullName: 'Kader Ditolak Staff',
        whatsappNumber: '081234567056',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'Belum Punya Bisnis',
      }),
    });
    expect(createAttempt.status).toBe(403);
    const errorJson = await createAttempt.json();
    expect(errorJson.success).toBe(false);
    expect(errorJson.message).toContain('Akses ditolak');
  });

  it('Step 2: Admin dynamically delegates can_create on kaders to Staff role and revokes can_delete', async () => {
    const updateRes = await app.request(`/api/admin/rbac/matrix/${staffRoleId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [
          {
            moduleId: kadersModuleId,
            canRead: true,
            canCreate: true,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
          },
        ],
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.success).toBe(true);
    expect(updateJson.message).toContain('Hak akses berhasil diperbarui');
  });

  it('Step 3: Staff user immediately exercises newly granted permission to create cadre, but deletion is blocked', async () => {
    // 1. Staff creates new cadre -> Now succeeds with 201 Created
    const createRes = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: '1201220057',
        fullName: 'Kader Dibuat Oleh Staff Terdelegasi',
        whatsappNumber: '081234567057',
        prodi: 'S1 Teknik Telekomunikasi',
        fakultas: 'FTE',
        interestCategory: 'Punya Bisnis',
      }),
    });

    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    expect(createJson.success).toBe(true);
    expect(createJson.data.nim).toBe('1201220057');
    const createdCadreId = createJson.data.id;

    // 2. Staff attempts to delete the cadre -> Blocked with 403 Forbidden
    const deleteAttempt = await app.request(`/api/kaders/${createdCadreId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(deleteAttempt.status).toBe(403);
    const deleteJson = await deleteAttempt.json();
    expect(deleteJson.success).toBe(false);
    expect(deleteJson.message).toContain('Akses ditolak');
  });

  it('Step 4: Rogue administrator attempts to revoke Admin access to admin-rbac -> Blocked by Self-Preservation Guardrail', async () => {
    const sabotageRes = await app.request(`/api/admin/rbac/matrix/${adminRoleId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [
          {
            moduleId: adminRbacModuleId,
            canRead: false,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
          },
        ],
      }),
    });

    expect(sabotageRes.status).toBe(400);
    const sabotageJson = await sabotageRes.json();
    expect(sabotageJson.success).toBe(false);
    expect(sabotageJson.message).toContain('tidak dapat dicabut demi mencegah penguncian sistem');
  });

  it('Step 5: Admin permissions remain intact, preventing organizational lockout', async () => {
    // 1. Verify Admin can still access the RBAC matrix
    const checkRes = await app.request('/api/admin/rbac/matrix', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(checkRes.status).toBe(200);
    const checkJson = await checkRes.json();
    expect(checkJson.success).toBe(true);

    // 2. Verify Admin's permission entry for admin-rbac module still has canRead: true
    const adminRbacPerm = checkJson.data.matrix.find(
      (m: any) => m.roleId === adminRoleId && m.moduleId === adminRbacModuleId
    );
    expect(adminRbacPerm).toBeDefined();
    expect(adminRbacPerm.canRead).toBe(true);

    // 3. Admin can still perform administrative operations without barrier
    const cadreListRes = await app.request('/api/kaders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(cadreListRes.status).toBe(200);
  });
});
