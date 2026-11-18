import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as xlsx from "xlsx";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, roles } from "../src/db/schema/auth.js";
import { eq } from "drizzle-orm";

describe("Milestone M1: Master Kader Management API Suite", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let defaultRoleId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    const adminLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220001", password: "admin123" }),
    });
    adminToken = (await adminLogin.json()).data.accessToken;

    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Kader 1"),
    });
    defaultRoleId = kader1Role!.id;
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. GET /api/kaders returns paginated list of cadres", async () => {
    const res = await app.request("/api/kaders?page=1&limit=5", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(5);
    expect(json.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("2. Multi-filtering by search, prodi, and interest category works accurately", async () => {
    const res = await app.request(
      "/api/kaders?search=Super&prodi=Sistem+Informasi&interest=Punya+Bisnis",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    for (const k of json.data) {
      expect(k.fullName).toContain("Super");
      expect(k.prodi).toContain("Sistem Informasi");
      expect(k.interestCategory).toBe("Punya Bisnis");
    }
  });

  it("3. Cadre creation auto-defaults password to NIM if omitted and enables login", async () => {
    const newNim = "1201225555";
    const createRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: defaultRoleId,
        nim: newNim,
        fullName: "Kader Auto Password",
        whatsappNumber: "081234565555",
        prodi: "S1 Teknik Telekomunikasi",
        fakultas: "Fakultas Teknik Elektro",
        interestCategory: "Kompetisi",
      }),
    });

    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    expect(createJson.success).toBe(true);
    expect(createJson.data.nim).toBe(newNim);
    expect(createJson.data.passwordHash).toBeUndefined();

    // Verify login with password = nim
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nim: newNim,
        password: newNim,
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.accessToken).toBeDefined();
  });

  it("4. Rejects duplicate NIM on cadre creation with 409 Conflict", async () => {
    const duplicateRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: defaultRoleId,
        nim: "1201220001", // already exists (Superadmin)
        fullName: "Kader Duplikat",
        whatsappNumber: "081234560000",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Belum Punya Bisnis",
      }),
    });

    expect(duplicateRes.status).toBe(409);
    const json = await duplicateRes.json();
    expect(json.success).toBe(false);
  });

  it("5. GET /api/kaders/:id and PATCH /api/kaders/:id perform detail retrieval and partial update", async () => {
    // 1. Get Superadmin record
    const adminRecord = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, "1201220001"),
    });

    // 2. GET detail
    const detailRes = await app.request(`/api/kaders/${adminRecord!.id}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.data.fullName).toBe("Super Administrator");

    // 3. PATCH update
    const patchRes = await app.request(`/api/kaders/${adminRecord!.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "PT HIPMI Inovasi Mandiri",
        instagram: "@superadmin.hipmi",
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.data.businessName).toBe("PT HIPMI Inovasi Mandiri");
    expect(patchJson.data.instagram).toBe("@superadmin.hipmi");
  });

  it("6. DELETE /api/kaders/:id performs soft delete (sets status to Non-Aktif)", async () => {
    // Create temporary cadre to delete
    const tempNim = "1201227777";
    const createRes = await app.request("/api/kaders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roleId: defaultRoleId,
        nim: tempNim,
        fullName: "Kader Akan Dihapus",
        whatsappNumber: "081234567777",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Belum Punya Bisnis",
      }),
    });
    const tempId = (await createRes.json()).data.id;

    // Delete
    const deleteRes = await app.request(`/api/kaders/${tempId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.status).toBe(200);

    // Verify in database that status is now Non-Aktif
    const dbCadre = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.id, tempId),
    });
    expect(dbCadre!.status).toBe("Non-Aktif");
  });

  it("7. GET /api/kaders/export exports cadres to valid Excel and CSV formats", async () => {
    // 1. Export Excel
    const xlsxRes = await app.request("/api/kaders/export?format=xlsx", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers.get("Content-Type")).toContain("spreadsheetml");
    const xlsxBuffer = Buffer.from(await xlsxRes.arrayBuffer());
    const workbook = xlsx.read(xlsxBuffer, { type: "buffer" });
    expect(workbook.SheetNames.length).toBeGreaterThan(0);

    // 2. Export CSV
    const csvRes = await app.request("/api/kaders/export?format=csv", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("Content-Type")).toContain("text/csv");
    const csvText = await csvRes.text();
    expect(csvText).toContain("NIM");
    expect(csvText).toContain("Nama Lengkap");
  });

  it("8. POST /api/kaders/import creates NIM-only new cadres (password = NIM, profileCompleted = false), skips existing NIMs, and requires onboarding", async () => {
    const existingTargetNim = "1201225555";
    const beforeRecord = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, existingTargetNim),
    });
    const originalPasswordHash = beforeRecord!.passwordHash;
    const originalFullName = beforeRecord!.fullName;
    const originalScore = beforeRecord!.totalScore;

    const newCadreNim = "1201228888";
    const importRows = [
      { NIM: existingTargetNim },
      { NIM: newCadreNim },
    ];

    const ws = xlsx.utils.json_to_sheet(importRows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Import");
    const fileBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Staff"),
    });

    const formData = new FormData();
    const blob = new Blob([fileBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", blob, "test-import-nim.xlsx");
    formData.append("roleId", staffRole!.id);

    const importRes = await app.request("/api/kaders/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(importRes.status).toBe(200);
    const importJson = await importRes.json();
    expect(importJson.success).toBe(true);
    expect(importJson.data.created).toBe(1);
    expect(importJson.data.skipped).toBe(1);
    expect(importJson.data.failed).toBe(0);

    // Existing cadre must be untouched
    const afterRecord = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, existingTargetNim),
    });
    expect(afterRecord!.fullName).toBe(originalFullName);
    expect(afterRecord!.passwordHash).toBe(originalPasswordHash);
    expect(afterRecord!.totalScore).toBe(originalScore);

    // Newly imported cadre defaults to profileCompleted=false and password=NIM
    const newlyCreated = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, newCadreNim),
    });
    expect(newlyCreated).toBeDefined();
    expect(newlyCreated!.profileCompleted).toBe(false);
    expect(newlyCreated!.roleId).toBe(staffRole!.id);

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: newCadreNim, password: newCadreNim }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.user.onboardingMode).toBe("complete-profile");
    expect(loginJson.data.user.roleName).toBe("Staff");
    const newCadreToken = loginJson.data.accessToken as string;

    // Must reject newPassword === NIM
    const samePassRes = await app.request("/api/auth/complete-onboarding", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newCadreToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newPassword: newCadreNim,
        fullName: "Kader Onboarding",
        whatsappNumber: "081277776666",
        prodi: "S1 Teknik Industri",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Kompetisi",
      }),
    });
    expect(samePassRes.status).toBe(400);

    // Complete onboarding cleanly
    const completeRes = await app.request("/api/auth/complete-onboarding", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newCadreToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newPassword: "KaderSecurePassword1",
        fullName: "Kader Onboarding Lengkap",
        whatsappNumber: "081277776666",
        prodi: "S1 Teknik Industri",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Kompetisi",
        instagram: "@kaderbaru",
      }),
    });
    expect(completeRes.status).toBe(200);
    const completeJson = await completeRes.json();
    expect(completeJson.data.user.onboardingMode).toBe("none");
    expect(completeJson.data.user.profileCompleted).toBe(true);
    expect(completeJson.data.user.fullName).toBe("Kader Onboarding Lengkap");
  });

  it("8. GET /api/kaders/roles returns role options and POST /api/kaders/:id/reset-password resets cadre password", async () => {
    const rolesRes = await app.request("/api/kaders/roles", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(rolesRes.status).toBe(200);
    const rolesJson = await rolesRes.json();
    expect(Array.isArray(rolesJson.data)).toBe(true);
    expect(rolesJson.data.length).toBeGreaterThanOrEqual(6);

    const targetCadre = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, "1201228888"),
    });
    expect(targetCadre).toBeDefined();

    const resetRes = await app.request(
      `/api/kaders/${targetCadre!.id}/reset-password`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: "resetNewPass99" }),
      }
    );
    expect(resetRes.status).toBe(200);
    const resetJson = await resetRes.json();
    expect(resetJson.success).toBe(true);
    expect(resetJson.data.resetToNim).toBe(false);

    // Confirm cadre can log in with the newly reset password
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201228888", password: "resetNewPass99" }),
    });
    expect(loginRes.status).toBe(200);
  });
});
