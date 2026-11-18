import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, roles } from "../src/db/schema/auth.js";
import { eq } from "drizzle-orm";

describe("Milestone M1: Authentication API Suite", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // Create an inactive cadre for testing
    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Kader 1"),
    });

    const inactivePasswordHash = await bcrypt.hash("inactive123", 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: "1201229999",
      passwordHash: inactivePasswordHash,
      fullName: "Kader Nonaktif",
      whatsappNumber: "081299999999",
      prodi: "S1 Sistem Informasi",
      fakultas: "Fakultas Rekayasa Industri",
      interestCategory: "Belum Punya Bisnis",
      status: "Non-Aktif",
      totalScore: 0,
    });
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. Successfully logs in with valid Superadmin NIM & password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "admin123",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
    expect(typeof json.data.accessToken).toBe("string");
    expect(json.data.user.nim).toBe("1201220001");
    expect(json.data.user.roleName).toBe("Admin");
    expect(json.data.user.passwordHash).toBeUndefined();
    expect(Array.isArray(json.data.permissions)).toBe(true);
    expect(json.data.permissions.length).toBeGreaterThan(0);
  });

  it("2. Rejects login with wrong password (401 Unauthorized)", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "wrongpassword",
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("3. Rejects login with non-existent NIM (401 Unauthorized)", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "9999999999",
        password: "admin123",
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("4. Rejects login for inactive cadre with status Non-Aktif (401 Unauthorized)", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201229999",
        password: "inactive123",
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain("Pengguna tidak aktif");
  });

  it("5. GET /api/auth/me rejects unauthenticated request (401 Unauthorized)", async () => {
    const res = await app.request("/api/auth/me", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("6. GET /api/auth/me returns current cadre profile and permissions with valid token", async () => {
    // Obtain token
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "admin123",
      }),
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data.accessToken;

    const meRes = await app.request("/api/auth/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.success).toBe(true);
    expect(meJson.data.user.nim).toBe("1201220001");
    expect(meJson.data.role.name).toBe("Admin");
    expect(meJson.data.totalScore).toBe(100);
    expect(Array.isArray(meJson.data.permissions)).toBe(true);
  });

  it("7. PATCH /api/auth/change-password validates old password and updates new password", async () => {
    // 1. Login to get token
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "admin123",
      }),
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data.accessToken;

    // 2. Incorrect old password -> 400 Bad Request
    const wrongOldRes = await app.request("/api/auth/change-password", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        oldPassword: "incorrectOldPassword",
        newPassword: "newAdminPassword123",
      }),
    });
    expect(wrongOldRes.status).toBe(400);

    // 3. Weak new password (< 6 chars) -> 400 Bad Request
    const shortNewRes = await app.request("/api/auth/change-password", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        oldPassword: "admin123",
        newPassword: "123",
      }),
    });
    expect(shortNewRes.status).toBe(400);

    // 4. Valid old password and new password -> 200 OK
    const validChangeRes = await app.request("/api/auth/change-password", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        oldPassword: "admin123",
        newPassword: "newAdminPassword123",
      }),
    });
    expect(validChangeRes.status).toBe(200);

    // 5. Subsequent login with old password fails (401)
    const oldLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "admin123",
      }),
    });
    expect(oldLoginRes.status).toBe(401);

    // 6. Subsequent login with new password succeeds (200)
    const newLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "newAdminPassword123",
      }),
    });
    expect(newLoginRes.status).toBe(200);
  });

  it("8. GET & PATCH /api/auth/profile allow self-profile editing via `profile` RBAC module", async () => {
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: "1201220001",
        password: "newAdminPassword123",
      }),
    });
    const token = (await loginRes.json()).data.accessToken;

    const getProfileRes = await app.request("/api/auth/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getProfileRes.status).toBe(200);

    const patchRes = await app.request("/api/auth/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Super Admin Terperbarui",
        whatsappNumber: "081234567890",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        instagram: "@superadmin_hipmi",
        businessName: "PT Karya HIPMI",
        interestCategory: "Punya Bisnis",
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.data.user.fullName).toBe("Super Admin Terperbarui");
    expect(patchJson.data.user.instagram).toBe("@superadmin_hipmi");
  });
});
