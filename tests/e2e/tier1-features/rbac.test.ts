import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles, modules, rolePermissions } from '../../../src/db/schema/auth.js';
import { eq, and } from 'drizzle-orm';

describe('Tier 1: Dynamic RBAC Suite (Features 9-11)', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let staffToken: string;
  let kader1Token: string;
  let staffRoleId: string;
  let adminRoleId: string;
  let kader1RoleId: string;
  let kadersModuleId: string;
  let adminRbacModuleId: string;
  let testCadreId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // 1. Resolve roles and modules
    const adminRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Admin'),
    });
    adminRoleId = adminRole!.id;

    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Staff'),
    });
    staffRoleId = staffRole!.id;

    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Kader 1'),
    });
    kader1RoleId = kader1Role!.id;

    const kadersMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, 'kaders'),
    });
    kadersModuleId = kadersMod!.id;

    const adminRbacMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, 'admin-rbac'),
    });
    adminRbacModuleId = adminRbacMod!.id;

    // 2. Create Staff Cadre
    const staffPasswordHash = await bcrypt.hash('staff123', 10);
    await dbHelper.db.insert(kaders).values({
      roleId: staffRoleId,
      nim: '1201220005',
      passwordHash: staffPasswordHash,
      fullName: 'Staff Operasional',
      whatsappNumber: '081234567895',
      prodi: 'S1 Sistem Informasi',
      fakultas: 'Fakultas Rekayasa Industri',
      interestCategory: 'Punya Bisnis',
      status: 'Aktif',
      totalScore: 50,
    });

    // 3. Create Kader 1 Cadre
    const kader1PasswordHash = await bcrypt.hash('kader123', 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1RoleId,
      nim: '1201220006',
      passwordHash: kader1PasswordHash,
      fullName: 'Kader Tingkat 1',
      whatsappNumber: '081234567896',
      prodi: 'S1 Informatika',
      fakultas: 'Fakultas Informatika',
      interestCategory: 'Belum Punya Bisnis',
      status: 'Aktif',
      totalScore: 10,
    });

    // 4. Create dummy cadre to test update/delete
    const dummyCadre = await dbHelper.db.insert(kaders).values({
      roleId: kader1RoleId,
      nim: '1201220099',
      passwordHash: 'dummy',
      fullName: 'Dummy Target Cadre',
      whatsappNumber: '081234567899',
      prodi: 'S1 Informatika',
      fakultas: 'FIF',
      interestCategory: 'Belum Punya Bisnis',
      status: 'Aktif',
    }).returning();
    testCadreId = dummyCadre[0].id;

    // 5. Login tokens
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    adminToken = (await adminLogin.json()).data.accessToken;

    const staffLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220005', password: 'staff123' }),
    });
    staffToken = (await staffLogin.json()).data.accessToken;

    const kader1Login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220006', password: 'kader123' }),
    });
    kader1Token = (await kader1Login.json()).data.accessToken;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  // =========================================================================
  // F9: Dynamic RBAC Schema (roles, modules, role_permissions matrix)
  // =========================================================================
  it('F9-1: Schema defines full cartesian product for roles and modules (54 permission entries)', async () => {
    const allRoles = await dbHelper.db.select().from(roles);
    const allModules = await dbHelper.db.select().from(modules);
    const allPerms = await dbHelper.db.select().from(rolePermissions);

    expect(allRoles.length).toBe(6);
    expect(allModules.length).toBe(9);
    expect(allPerms.length).toBe(54); // 6 x 9 = 54
  });

  it('F9-2: Permission matrix entries contain all 5 discrete action boolean flags', async () => {
    const samplePerm = await dbHelper.db.query.rolePermissions.findFirst();
    expect(samplePerm).toBeDefined();
    expect(typeof samplePerm!.canRead).toBe('boolean');
    expect(typeof samplePerm!.canCreate).toBe('boolean');
    expect(typeof samplePerm!.canUpdate).toBe('boolean');
    expect(typeof samplePerm!.canDelete).toBe('boolean');
    expect(typeof samplePerm!.canApprove).toBe('boolean');
  });

  it('F9-3: Unique constraint on (role_id, module_id) rejects duplicate permission entry', async () => {
    let duplicateRejected = false;
    try {
      await dbHelper.db.insert(rolePermissions).values({
        roleId: staffRoleId,
        moduleId: kadersModuleId,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canApprove: true,
      });
    } catch {
      duplicateRejected = true;
    }
    expect(duplicateRejected).toBe(true);
  });

  it('F9-4: Custom role creation and permission mapping functions correctly', async () => {
    const customRole = await dbHelper.db.insert(roles).values({
      name: 'Koordinator Acara',
      isSystemDefault: false,
    }).returning();

    expect(customRole[0].id).toBeDefined();
    expect(customRole[0].isSystemDefault).toBe(false);

    // Map permission
    const perm = await dbHelper.db.insert(rolePermissions).values({
      roleId: customRole[0].id,
      moduleId: kadersModuleId,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
    }).returning();
    expect(perm[0].id).toBeDefined();
  });

  it('F9-5: System default roles are flagged with is_system_default = true', async () => {
    const defaultRoles = await dbHelper.db.query.roles.findMany({
      where: eq(roles.isSystemDefault, true),
    });
    expect(defaultRoles.length).toBeGreaterThanOrEqual(6);
  });

  // =========================================================================
  // F10: Dynamic RBAC Middleware (can_read, can_create, can_update, can_delete, can_approve)
  // =========================================================================
  it('F10-1: User with can_read: true accesses GET /api/kaders successfully (200 OK)', async () => {
    const res = await app.request('/api/kaders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('F10-2: User with can_read: false is denied GET /api/kaders (403 Forbidden)', async () => {
    const res = await app.request('/api/kaders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${kader1Token}` },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F10-3: User with can_create: false is denied POST /api/kaders (403 Forbidden)', async () => {
    const res = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: '1201220055',
        fullName: 'Kader Ditolak',
        whatsappNumber: '081234567855',
        prodi: 'S1 Sistem Informasi',
        fakultas: 'FRI',
        interestCategory: 'Punya Bisnis',
      }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F10-4: User with can_update: false is denied PATCH /api/kaders/:id (403 Forbidden)', async () => {
    const res = await app.request(`/api/kaders/${testCadreId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fullName: 'Percobaan Update Ilegal' }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F10-5: User with can_delete: false is denied DELETE /api/kaders/:id (403 Forbidden)', async () => {
    const res = await app.request(`/api/kaders/${testCadreId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // =========================================================================
  // F11: Superadmin Bypass & Admin Lockout Self-Preservation
  // =========================================================================
  it('F11-1: Superadmin (Admin role) bypasses all permission matrix checks unconditionally', async () => {
    // Admin can read kaders
    const readRes = await app.request('/api/kaders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(readRes.status).toBe(200);

    // Admin can create cadre
    const createRes = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: '1201220777',
        fullName: 'Kader Khusus Superadmin',
        whatsappNumber: '081234567777',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'Kompetisi',
      }),
    });
    expect(createRes.status).toBe(201);
  });

  it('F11-2: Non-admin roles cannot access RBAC matrix management endpoints (403 Forbidden)', async () => {
    const matrixRes = await app.request('/api/admin/rbac/matrix', {
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(matrixRes.status).toBe(403);
    const json = await matrixRes.json();
    expect(json.success).toBe(false);
  });

  it('F11-3: Self-Preservation Guardrail: Rejects attempt to revoke Admin permissions on admin-rbac (400 Bad Request)', async () => {
    const lockAttemptRes = await app.request(`/api/admin/rbac/matrix/${adminRoleId}`, {
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

    expect(lockAttemptRes.status).toBe(400);
    const json = await lockAttemptRes.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('tidak dapat dicabut');
  });

  it('F11-4: Admin role inspecting matrix via GET /api/admin/rbac/matrix succeeds (200 OK)', async () => {
    const matrixRes = await app.request('/api/admin/rbac/matrix', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(matrixRes.status).toBe(200);
    const json = await matrixRes.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.matrix)).toBe(true);
  });

  it('F11-5: Permission updates for other roles take effect dynamically on subsequent requests', async () => {
    // Grant Staff canCreate on kaders
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

    // Staff now can create cadre
    const createRes = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: '1201220888',
        fullName: 'Kader Legal Setelah Promosi Izin',
        whatsappNumber: '081234567888',
        prodi: 'S1 Sistem Informasi',
        fakultas: 'FRI',
        interestCategory: 'Punya Bisnis',
      }),
    });
    expect(createRes.status).toBe(201);
  });
});
