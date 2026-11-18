import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, modules, roles } from "../src/db/schema/auth.js";

describe("Password Reset Request Queue & Unbound RBAC Workflow", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let topmanToken: string;
  let topmanRoleId: string;
  let resetModId: string;
  let targetNim = "1201224444";
  let requestId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    const adminLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220001", password: "admin123" }),
    });
    adminToken = (await adminLogin.json()).data.accessToken;

    const topmanRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Topman"),
    });
    topmanRoleId = topmanRole!.id;

    const kader1Role = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Kader 1"),
    });

    const resetMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, "password-reset"),
    });
    resetModId = resetMod!.id;

    await dbHelper.db.insert(kaders).values([
      {
        roleId: topmanRoleId,
        nim: "1201223333",
        passwordHash: await bcrypt.hash("topman123", 10),
        fullName: "Topman Reviewer",
        whatsappNumber: "081233333333",
        prodi: "S1 Manajemen",
        fakultas: "FEB",
        interestCategory: "Punya Bisnis",
        status: "Aktif",
        profileCompleted: true,
      },
      {
        roleId: kader1Role!.id,
        nim: targetNim,
        passwordHash: await bcrypt.hash("OldSecret99", 10),
        fullName: "Kader Lupa Password",
        whatsappNumber: "081244444444",
        prodi: "S1 Teknik Industri",
        fakultas: "FRI",
        interestCategory: "Kompetisi",
        status: "Aktif",
        profileCompleted: true,
      },
    ]);

    const topmanLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201223333", password: "topman123" }),
    });
    topmanToken = (await topmanLogin.json()).data.accessToken;
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. Public /api/auth/forgot-password creates PENDING request and prevents duplicates", async () => {
    const req1 = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: targetNim }),
    });
    expect(req1.status).toBe(201);
    const j1 = await req1.json();
    requestId = j1.data.id;
    expect(j1.data.status).toBe("PENDING");

    const dupReq = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: targetNim }),
    });
    expect(dupReq.status).toBe(409);
  });

  it("2. Module password-reset is unbound by role until granted via /api/admin/rbac/matrix", async () => {
    const deniedRes = await app.request("/api/password-resets", {
      headers: { Authorization: `Bearer ${topmanToken}` },
    });
    expect(deniedRes.status).toBe(403);

    const grantRes = await app.request(`/api/admin/rbac/matrix/${topmanRoleId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        permissions: [
          {
            moduleId: resetModId,
            canRead: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: true,
          },
        ],
      }),
    });
    expect(grantRes.status).toBe(200);

    const allowedRes = await app.request("/api/password-resets/pending-count", {
      headers: { Authorization: `Bearer ${topmanToken}` },
    });
    expect(allowedRes.status).toBe(200);
    expect((await allowedRes.json()).data.pendingCount).toBe(1);
  });

  it("3. Approving reset sets password = NIM, login yields onboardingMode=reset-password, and kader must set password != NIM", async () => {
    const approveRes = await app.request(`/api/password-resets/${requestId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${topmanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notes: "Diverifikasi via pengajuan" }),
    });
    expect(approveRes.status).toBe(200);

    const countRes = await app.request("/api/password-resets/pending-count", {
      headers: { Authorization: `Bearer ${topmanToken}` },
    });
    expect((await countRes.json()).data.pendingCount).toBe(0);

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: targetNim, password: targetNim }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.user.onboardingMode).toBe("reset-password");
    const resetToken = loginJson.data.accessToken as string;

    const completeRes = await app.request("/api/auth/complete-onboarding", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resetToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newPassword: "BrandNewPassword2" }),
    });
    expect(completeRes.status).toBe(200);
    expect((await completeRes.json()).data.user.onboardingMode).toBe("none");
  });
});
