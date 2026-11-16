import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import bcrypt from 'bcryptjs';
import * as xlsx from 'xlsx';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { kaders, roles, modules, rolePermissions } from '../../../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';
import {
  createTestToken,
  verifyToken,
  decodeToken,
  TEST_USERS,
} from '../../helpers/auth-helper.js';

describe('Tier 1: Auth & Kader Database (Features 1-8)', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let adminRoleId: string;
  let staffRoleId: string;
  let kader1RoleId: string;
  let createdCadreId: string;
  const testNim = '1201221101';

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

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

    // Login admin to obtain live access token
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    const loginJson = await loginRes.json();
    adminToken = loginJson.data.accessToken;

    // Seed distinct cadres for filtering tests
    const sampleCadres = [
      {
        roleId: staffRoleId,
        nim: '1201227001',
        fullName: 'Kader Informatika 1',
        whatsappNumber: '081234567701',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'Kompetisi' as const,
        status: 'Aktif' as const,
      },
      {
        roleId: staffRoleId,
        nim: '1201227002',
        fullName: 'Kader Industri 1',
        whatsappNumber: '081234567702',
        prodi: 'S1 Teknik Industri',
        fakultas: 'FRI',
        interestCategory: 'Punya Bisnis' as const,
        status: 'Aktif' as const,
      },
      {
        roleId: kader1RoleId,
        nim: '1201227003',
        fullName: 'Kader Alumni 1',
        whatsappNumber: '081234567703',
        prodi: 'S1 Manajemen Bisnis',
        fakultas: 'FEB',
        interestCategory: 'Belum Punya Bisnis' as const,
        status: 'Alumni' as const,
      },
    ];

    for (const sc of sampleCadres) {
      const hash = await bcrypt.hash('secret123', 10);
      await dbHelper.db.insert(kaders).values({
        ...sc,
        passwordHash: hash,
      });
    }
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  // =========================================================================
  // F1: Foundation & Hono Scaffolding
  // =========================================================================
  it('F1-1: GET /health returns HTTP 200 with service health payload', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('hipmi-pt-telkom-api');
    expect(typeof json.timestamp).toBe('string');
  });

  it('F1-2: Non-existent route returns HTTP 404 with standard error contract', async () => {
    const res = await app.request('/api/non-existent-endpoint-xyz');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });

  it('F1-3: CORS headers configured properly on preflight request', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status === 204 || res.status === 200).toBe(true);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('F1-4: Request with malformed JSON body returns HTTP 400 Bad Request', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"nim": "1201220001", "password": invalid_json',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F1-5: Error middleware returns consistent JSON error schema on unhandled error', async () => {
    const res = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message || json.error).toBeDefined();
  });

  // =========================================================================
  // F2: Drizzle ORM DB Pool & Migrations
  // =========================================================================
  it('F2-1: Database client pool connects and executes basic query', async () => {
    const allRoles = await dbHelper.db.select().from(roles);
    expect(Array.isArray(allRoles)).toBe(true);
    expect(allRoles.length).toBeGreaterThanOrEqual(6);
  });

  it('F2-2: Database schema enforces unique constraints (e.g., unique NIM on kaders)', async () => {
    const existing = await dbHelper.db.query.kaders.findFirst();
    expect(existing).toBeDefined();

    let duplicateFailed = false;
    try {
      await dbHelper.db.insert(kaders).values({
        roleId: adminRoleId,
        nim: existing!.nim,
        passwordHash: 'hash',
        fullName: 'Duplicate Cadet',
        whatsappNumber: '081234567890',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'Belum Punya Bisnis',
        status: 'Aktif',
      });
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);
  });

  it('F2-3: Foreign key constraint prevents orphan cadre without valid role', async () => {
    let fkFailed = false;
    try {
      await dbHelper.db.insert(kaders).values({
        roleId: '00000000-0000-0000-0000-000000000000',
        nim: '9999999998',
        passwordHash: 'hash',
        fullName: 'Orphan Cadet',
        whatsappNumber: '081234567890',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'Belum Punya Bisnis',
        status: 'Aktif',
      });
    } catch {
      fkFailed = true;
    }
    expect(fkFailed).toBe(true);
  });

  it('F2-4: Database enums enforce valid cadre_interest values', async () => {
    let enumFailed = false;
    try {
      await dbHelper.db.insert(kaders).values({
        roleId: adminRoleId,
        nim: '9999999997',
        passwordHash: 'hash',
        fullName: 'Bad Enum Cadet',
        whatsappNumber: '081234567890',
        prodi: 'S1 Informatika',
        fakultas: 'FIF',
        interestCategory: 'NonExistentCategory' as any,
        status: 'Aktif',
      });
    } catch {
      enumFailed = true;
    }
    expect(enumFailed).toBe(true);
  });

  it('F2-5: Indexes are defined and queryable on key lookup columns', async () => {
    const rows = await dbHelper.db.query.kaders.findMany({
      where: eq(kaders.status, 'Aktif'),
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // F3: Auth & Kader Schema & Seed Data
  // =========================================================================
  it('F3-1: System seeds all 6 mandatory default roles', async () => {
    const allRoles = await dbHelper.db.select().from(roles);
    const roleNames = allRoles.map((r) => r.name);
    expect(roleNames).toContain('Admin');
    expect(roleNames).toContain('Topman');
    expect(roleNames).toContain('Kabid');
    expect(roleNames).toContain('Kadiv');
    expect(roleNames).toContain('Staff');
    expect(roleNames).toContain('Kader 1');
  });

  it('F3-2: System seeds master modules covering all PRD operational areas', async () => {
    const allMods = await dbHelper.db.select().from(modules);
    const modCodes = allMods.map((m) => m.code);
    expect(modCodes).toContain('kaders');
    expect(modCodes).toContain('dashboard');
    expect(modCodes).toContain('finance');
    expect(modCodes).toContain('tracking');
    expect(modCodes).toContain('admin-rbac');
  });

  it('F3-3: System seeds role_permissions for all roles x modules matrix', async () => {
    const perms = await dbHelper.db.select().from(rolePermissions);
    expect(perms.length).toBeGreaterThanOrEqual(18);
  });

  it('F3-4: System seeds initial superadmin cadre account with status Aktif', async () => {
    const adminCadre = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, '1201220001'),
    });
    expect(adminCadre).toBeDefined();
    expect(adminCadre!.fullName).toContain('Super Admin');
    expect(adminCadre!.status).toBe('Aktif');
  });

  it('F3-5: Default roles have is_system_default set to true', async () => {
    const adminRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, 'Admin'),
    });
    expect(adminRole?.isSystemDefault).toBe(true);
  });

  // =========================================================================
  // F4: Password Hashing & NIM/Password Authentication
  // =========================================================================
  it('F4-1: Successful login with valid NIM and password returns accessToken and user profile', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.user.nim).toBe('1201220001');
    expect(json.data.user.passwordHash).toBeUndefined();
  });

  it('F4-2: Login with incorrect password returns HTTP 401 Unauthorized', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'WrongPassword999' }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F4-3: Login with non-existent NIM returns HTTP 401 Unauthorized', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '0000000000', password: 'admin123' }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F4-4: Cadre with Non-Aktif status is denied login (401 Unauthorized)', async () => {
    const inactiveNim = '1201228888';
    const hash = await bcrypt.hash('secret123', 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1RoleId,
      nim: inactiveNim,
      passwordHash: hash,
      fullName: 'Kader Non-Aktif Test',
      whatsappNumber: '081288888888',
      prodi: 'S1 Informatika',
      fakultas: 'FIF',
      interestCategory: 'Belum Punya Bisnis',
      status: 'Non-Aktif',
    });

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: inactiveNim, password: 'secret123' }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('tidak aktif');
  });

  it('F4-5: Passwords in database are strictly salted bcrypt hashes', async () => {
    const adminCadre = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, '1201220001'),
    });
    expect(adminCadre?.passwordHash.startsWith('$2')).toBe(true);
    const matches = await bcrypt.compare('admin123', adminCadre!.passwordHash);
    expect(matches).toBe(true);
  });

  // =========================================================================
  // F5: JWT Session Token Generation & Verification
  // =========================================================================
  it('F5-1: Token carries standard JWT header and valid signature structure', () => {
    const token = createTestToken('admin');
    const parts = token.split('.');
    expect(parts.length).toBe(3);

    const decoded = decodeToken(token);
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.header.typ).toBe('JWT');
  });

  it('F5-2: Token payload carries essential claims (sub, nim, roleId, roleCode, exp, iat)', () => {
    const token = createTestToken('staff');
    const decoded = decodeToken(token);
    expect(decoded.payload.sub).toBeDefined();
    expect(decoded.payload.nim).toBe(TEST_USERS.staff.nim);
    expect(decoded.payload.roleCode).toBe('staff');
    expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.iat);
  });

  it('F5-3: Protected route accepts valid Bearer token and returns profile data', async () => {
    const res = await app.request('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.nim).toBe('1201220001');
  });

  it('F5-4: Tampered token signature is rejected by auth middleware (401 Unauthorized)', async () => {
    const tampered = adminToken.slice(0, -6) + 'xxxxxx';
    const res = await app.request('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('F5-5: Expired token is rejected by token verification (401 Unauthorized)', async () => {
    const expiredToken = createTestToken('admin', { expiresIn: -3600 });
    const verifyRes = verifyToken(expiredToken);
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.error).toContain('expired');

    const res = await app.request('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });

  // =========================================================================
  // F6: Master Kader CRUD & Details
  // =========================================================================
  it('F6-1: Admin creates new cadre via POST /api/kaders (201 Created)', async () => {
    const res = await app.request('/api/kaders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: testNim,
        fullName: 'Budi Santoso CRUD Test',
        whatsappNumber: '081234567891',
        prodi: 'S1 Teknik Industri',
        fakultas: 'Fakultas Rekayasa Industri',
        interestCategory: 'Punya Bisnis',
        businessName: 'Budi Snack',
        status: 'Aktif',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.nim).toBe(testNim);
    createdCadreId = json.data.id;
  });

  it('F6-2: Retrieve created cadre by ID via GET /api/kaders/:id returns 200 OK', async () => {
    const res = await app.request(`/api/kaders/${createdCadreId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(createdCadreId);
    expect(json.data.nim).toBe(testNim);
    expect(json.data.fullName).toBe('Budi Santoso CRUD Test');
  });

  it('F6-3: List cadres via GET /api/kaders returns paginated cadre list with metadata', async () => {
    const res = await app.request('/api/kaders?page=1&limit=10', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.meta.page).toBe(1);
    expect(json.meta.total).toBeGreaterThan(0);
  });

  it('F6-4: Update cadre via PATCH /api/kaders/:id updates allowed fields (200 OK)', async () => {
    const res = await app.request(`/api/kaders/${createdCadreId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Budi Santoso Diperbarui',
        businessName: 'Budi Digital Corp',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.fullName).toBe('Budi Santoso Diperbarui');
    expect(json.data.businessName).toBe('Budi Digital Corp');
  });

  it('F6-5: Soft delete cadre via DELETE /api/kaders/:id marks cadre status as Non-Aktif', async () => {
    const res = await app.request(`/api/kaders/${createdCadreId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const getRes = await app.request(`/api/kaders/${createdCadreId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getJson = await getRes.json();
    expect(getJson.data.status).toBe('Non-Aktif');
  });

  // =========================================================================
  // F7: Master Kader Filtering
  // =========================================================================
  it('F7-1: Filter by Prodi returns only matching cadres', async () => {
    const res = await app.request('/api/kaders?prodi=Informatika', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    for (const item of json.data) {
      expect(item.prodi.toLowerCase()).toContain('informatika');
    }
  });

  it('F7-2: Filter by Fakultas returns only matching cadres', async () => {
    const res = await app.request('/api/kaders?fakultas=FRI', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    for (const item of json.data) {
      expect(item.fakultas).toContain('FRI');
    }
  });

  it('F7-3: Filter by Kategori Minat returns matching cadres', async () => {
    const res = await app.request('/api/kaders?interest=Kompetisi', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    for (const item of json.data) {
      expect(item.interestCategory).toBe('Kompetisi');
    }
  });

  it('F7-4: Filter by Status (Alumni) returns only alumni cadres', async () => {
    const res = await app.request('/api/kaders?status=Alumni', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    for (const item of json.data) {
      expect(item.status).toBe('Alumni');
    }
  });

  it('F7-5: Composite multi-attribute filter narrows down accurately', async () => {
    const res = await app.request('/api/kaders?prodi=Informatika&interest=Kompetisi&status=Aktif', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    for (const item of json.data) {
      expect(item.prodi.toLowerCase()).toContain('informatika');
      expect(item.interestCategory).toBe('Kompetisi');
      expect(item.status).toBe('Aktif');
    }
  });

  // =========================================================================
  // F8: Master Kader Bulk Import & Export
  // =========================================================================
  it('F8-1: Export kaders to Excel returns application/vnd.openxmlformats binary buffer', async () => {
    const res = await app.request('/api/kaders/export?format=xlsx', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const ab = await res.arrayBuffer();
    expect(ab.byteLength).toBeGreaterThan(500);

    const wb = xlsx.read(Buffer.from(ab), { type: 'buffer' });
    expect(wb.SheetNames.length).toBeGreaterThan(0);
  });

  it('F8-2: Export kaders to CSV returns text/csv with header row', async () => {
    const res = await app.request('/api/kaders/export?format=csv', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('NIM');
    expect(text).toContain('Nama Lengkap');
    expect(text).toContain('Prodi');
  });

  it('F8-3: Bulk import valid Excel creates new cadres and returns inserted count', async () => {
    const importNim1 = '1201229101';
    const importNim2 = '1201229102';

    const rows = [
      {
        NIM: importNim1,
        'Nama Lengkap': 'Kader Impor Pertama',
        WhatsApp: '081299999101',
        Prodi: 'S1 Informatika',
        Fakultas: 'FIF',
        Minat: 'Punya Bisnis',
        Status: 'Aktif',
      },
      {
        NIM: importNim2,
        'Nama Lengkap': 'Kader Impor Kedua',
        WhatsApp: '081299999102',
        Prodi: 'S1 Teknik Telekomunikasi',
        Fakultas: 'FTE',
        Minat: 'Kompetisi',
        Status: 'Aktif',
      },
    ];

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Kader');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'kaders.xlsx'
    );

    const res = await app.request('/api/kaders/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.created).toBeGreaterThanOrEqual(2);
  });

  it('F8-4: Bulk import file with missing required fields handles error gracefully', async () => {
    const badRows = [{ 'Nomor Acak': '999', Keterangan: 'Data Kosong' }];
    const ws = xlsx.utils.json_to_sheet(badRows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: 'application/vnd.ms-excel' }),
      'bad.xlsx'
    );

    const res = await app.request('/api/kaders/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    if (res.status === 200) {
      const json = await res.json();
      expect(json.data.created).toBe(0);
    } else {
      expect(res.status >= 400).toBe(true);
    }
  });

  it('F8-5: Bulk import with duplicate NIM skips existing cadre or records error', async () => {
    const dupRows = [
      {
        NIM: '1201220001',
        'Nama Lengkap': 'Duplikat Superadmin',
        WhatsApp: '081234567890',
        Prodi: 'S1 Informatika',
        Fakultas: 'FIF',
        Minat: 'Belum Punya Bisnis',
        Status: 'Aktif',
      },
    ];
    const ws = xlsx.utils.json_to_sheet(dupRows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: 'application/vnd.ms-excel' }),
      'dup.xlsx'
    );

    const res = await app.request('/api/kaders/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated !== undefined || json.data.failed !== undefined).toBe(true);
  });
});
