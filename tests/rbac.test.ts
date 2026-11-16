import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, roles, modules } from "../src/db/schema/auth.js";
import { eq } from "drizzle-orm";

describe("Milestone M1: Dynamic RBAC Suite", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let staffToken: string;
  let kader1Token: string;
  let staffRoleId: string;
  let adminRoleId: string;
  let kadersModuleId: string;
  let adminRbacModuleId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // 1. Get Roles & Modules
    const adminRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Admin"),
    });
    adminRoleId = adminRole!.id;

    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Staff"),
    });
    staffRoleId = staffRole!.id;

    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Kader 1"),
    });

    const kadersMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, "kaders"),
    });
    kadersModuleId = kadersMod!.id;

    const adminRbacMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, "admin-rbac"),
    });
    adminRbacModuleId = adminRbacMod!.id;

    // 2. Create Staff Cadre
    const staffPasswordHash = await bcrypt.hash("staff123", 10);
    await dbHelper.db.insert(kaders).values({
      roleId: staffRoleId,
      nim: "1201220005",
      passwordHash: staffPasswordHash,
      fullName: "Staff Operasional",
      whatsappNumber: "081234567895",
      prodi: "S1 Sistem Informasi",
      fakultas: "Fakultas Rekayasa Industri",
      interestCategory: "Punya Bisnis",
      status: "Aktif",
      totalScore: 50,
    });

    // 3. Create Kader 1 Cadre
    const kader1PasswordHash = await bcrypt.hash("kader123", 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: "1201220006",
      passwordHash: kader1PasswordHash,
      fullName: "Kader Tingkat 1",
      whatsappNumber: "081234567896",
      prodi: "S1 Informatika",
      fakultas: "Fakultas Informatika",
      interestCategory: "Belum Punya Bisnis",
      status: "Aktif",
      totalScore: 10,
    });

    // 4. Login tokens
    const adminLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220001", password: "admin123" }),
    });
    adminToken = (await adminLogin.json()).data.accessToken;

    const staffLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220005", password: "staff123" }),
    });
    staffToken = (await staffLogin.json()).data.accessToken;

    const kader1Login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220006", password: "kader123" }),
    });
    kader1Token = (await kader1Login.json()).data.accessToken;
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. Superadmin Bypass: Admin role has unrestricted access across all actions", async () => {
    // Admin can read kaders
    const readRes = await app.request("/api/kaders", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(readRes.status).toBe(200);

    // Admin can create cadre
    const createRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: "1201220077",
        fullName: "Kader Baru Admin",
        whatsappNumber: "081234567777",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Punya Bisnis",
      }),
    });
    expect(createRes.status).toBe(201);
  });

  it("2. Staff role is granted GET /api/kaders (can_read: true) but denied POST /api/kaders (can_create: false)", async () => {
    // Staff can read kaders
    const readRes = await app.request("/api/kaders", {
      method: "GET",
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(readRes.status).toBe(200);

    // Staff cannot create kaders (403 Forbidden)
    const createRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: "1201220088",
        fullName: "Kader Ilegal Staff",
        whatsappNumber: "081234567888",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Belum Punya Bisnis",
      }),
    });
    expect(createRes.status).toBe(403);
    const json = await createRes.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain("Akses ditolak");
  });

  it("3. Kader 1 role is denied GET /api/kaders (can_read: false -> 403 Forbidden)", async () => {
    const readRes = await app.request("/api/kaders", {
      method: "GET",
      headers: { Authorization: `Bearer ${kader1Token}` },
    });
    expect(readRes.status).toBe(403);
  });

  it("4. Non-admin roles cannot access RBAC matrix management endpoints (403 Forbidden)", async () => {
    const matrixRes = await app.request("/api/admin/rbac/matrix", {
      method: "GET",
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(matrixRes.status).toBe(403);
  });

  it("5. Admin can inspect full RBAC matrix via GET /api/admin/rbac/matrix", async () => {
    const matrixRes = await app.request("/api/admin/rbac/matrix", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(matrixRes.status).toBe(200);
    const json = await matrixRes.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.roles)).toBe(true);
    expect(Array.isArray(json.data.modules)).toBe(true);
    expect(Array.isArray(json.data.matrix)).toBe(true);
    expect(json.data.matrix.length).toBe(54); // 6 roles * 9 modules
  });

  it("6. Admin updates Staff permissions, and Staff permissions dynamically take effect", async () => {
    // 1. Grant Staff canCreate on kaders module
    const updateRes = await app.request(`/api/admin/rbac/matrix/${staffRoleId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
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

    // 2. Staff now can successfully create cadre
    const createRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: staffRoleId,
        nim: "1201220099",
        fullName: "Kader Sah Dipromosikan Staff",
        whatsappNumber: "081234567999",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Belum Punya Bisnis",
      }),
    });
    expect(createRes.status).toBe(201);
  });

  it("7. Self-Preservation Guardrail: Rejects attempt to revoke Admin permissions on admin-rbac (400 Bad Request)", async () => {
    const lockAttemptRes = await app.request(`/api/admin/rbac/matrix/${adminRoleId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
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
    expect(json.message).toContain("tidak dapat dicabut demi mencegah penguncian sistem");
  });
});
