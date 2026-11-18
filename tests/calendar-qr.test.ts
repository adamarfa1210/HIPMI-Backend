import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, modules, roles } from "../src/db/schema/auth.js";

describe("Calendar HIPMI: RBPL, Target Roles, Attendance Sorting & Flexible QR Scanner", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let topmanToken: string;
  let kabidToken: string;
  let staffToken: string;

  let topmanRoleId: string;
  let kabidRoleId: string;
  let staffRoleId: string;
  let rbplModuleId: string;
  let qrScannerModuleId: string;

  let rbplEventId: string;
  let rbplQrPayload: string;
  let kabidId: string;

  async function loginAs(nim: string, password: string) {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim, password }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    return json.data.accessToken as string;
  }

  beforeAll(async () => {
    dbHelper = await createTestDatabase();
    adminToken = await loginAs("1201220001", "admin123");

    const topmanRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Topman"),
    });
    const kabidRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Kabid"),
    });
    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Staff"),
    });
    topmanRoleId = topmanRole!.id;
    kabidRoleId = kabidRole!.id;
    staffRoleId = staffRole!.id;

    const rbplMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, "rbpl"),
    });
    const scannerMod = await dbHelper.db.query.modules.findFirst({
      where: eq(modules.code, "qr-scanner"),
    });
    expect(rbplMod).toBeTruthy();
    expect(scannerMod).toBeTruthy();
    rbplModuleId = rbplMod!.id;
    qrScannerModuleId = scannerMod!.id;

    const passwordHash = await bcrypt.hash("test1234", 10);
    await dbHelper.db.insert(kaders).values({
      roleId: topmanRoleId,
      nim: "1201228001",
      passwordHash,
      fullName: "Topman Satu",
      whatsappNumber: "081234580001",
      prodi: "S1 Sistem Informasi",
      fakultas: "FRI",
      interestCategory: "Punya Bisnis",
      status: "Aktif",
      totalScore: 0,
    });

    const [kabidRow] = await dbHelper.db
      .insert(kaders)
      .values({
        roleId: kabidRoleId,
        nim: "1201228002",
        passwordHash,
        fullName: "Kabid Satu",
        whatsappNumber: "081234580002",
        prodi: "S1 Manajemen",
        fakultas: "FEB",
        interestCategory: "Kompetisi",
        status: "Aktif",
        totalScore: 10,
      })
      .returning();
    kabidId = kabidRow.id;

    await dbHelper.db.insert(kaders).values({
      roleId: staffRoleId,
      nim: "1201228003",
      passwordHash,
      fullName: "Staff Satu",
      whatsappNumber: "081234580003",
      prodi: "S1 Informatika",
      fakultas: "FIF",
      interestCategory: "Belum Punya Bisnis",
      status: "Aktif",
      totalScore: 0,
    });

    topmanToken = await loginAs("1201228001", "test1234");
    kabidToken = await loginAs("1201228002", "test1234");
    staffToken = await loginAs("1201228003", "test1234");
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. Unbound RBAC defaults: Topman/Kabid/Staff start without rbpl & qr-scanner access until granted via Settings", async () => {
    const rbplAttempt = await app.request("/api/calendar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${topmanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "RBPL Perdana",
        category: "RBPL",
        startAt: "2026-11-20T19:00:00.000Z",
        endAt: "2026-11-20T21:00:00.000Z",
        location: "Ruang Rapat HIPMI",
        enableQrAttendance: true,
        pointsPerAttendance: 15,
      }),
    });
    expect(rbplAttempt.status).toBe(403);

    const scanAttempt = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: "{}" }),
    });
    expect(scanAttempt.status).toBe(403);
  });

  it("2. Dynamic RBAC setup: Admin grants Topman rbpl create/read & grants qr-scanner to Topman, Kabid, Staff", async () => {
    const grantTopman = await app.request(`/api/admin/rbac/matrix/${topmanRoleId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        permissions: [
          {
            moduleId: rbplModuleId,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            canApprove: false,
          },
          {
            moduleId: qrScannerModuleId,
            canRead: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
          },
        ],
      }),
    });
    expect(grantTopman.status).toBe(200);

    for (const rid of [kabidRoleId, staffRoleId]) {
      const res = await app.request(`/api/admin/rbac/matrix/${rid}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissions: [
            {
              moduleId: qrScannerModuleId,
              canRead: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canApprove: false,
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
    }
  });

  it("3. Topman creates RBPL with QR Attendance (+15 pts) targeting Topman & Kabid only", async () => {
    const res = await app.request("/api/calendar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${topmanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "RBPL Evaluasi Q4",
        category: "RBPL",
        startAt: "2026-11-20T12:00:00.000Z",
        endAt: "2026-11-20T15:00:00.000Z",
        location: "TUCH Telkom University",
        enableQrAttendance: true,
        pointsPerAttendance: 15,
        targetRoleIds: [topmanRoleId, kabidRoleId],
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    rbplEventId = json.data.id;
    rbplQrPayload = json.data.qrPayload;

    expect(json.data.enableQrAttendance).toBe(true);
    expect(json.data.pointsPerAttendance).toBe(15);
    expect(json.data.qrIsOpen).toBe(true);
    expect(json.data.canManageQr).toBe(true);
    expect(typeof rbplQrPayload).toBe("string");
  });

  it("4. Per-agenda role audience: Kabid sees RBPL (without secret QR payload), Staff does NOT see it", async () => {
    const kabidList = await app.request("/api/calendar", {
      headers: { Authorization: `Bearer ${kabidToken}` },
    });
    expect(kabidList.status).toBe(200);
    const kabidJson = await kabidList.json();
    const kabidEv = kabidJson.data.find((e: any) => e.id === rbplEventId);
    expect(kabidEv).toBeTruthy();
    expect(kabidEv.canManageQr).toBe(false);
    expect(kabidEv.qrPayload).toBeNull();

    const staffList = await app.request("/api/calendar", {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(staffList.status).toBe(200);
    const staffJson = await staffList.json();
    expect(staffJson.data.find((e: any) => e.id === rbplEventId)).toBeUndefined();

    const staffAtt = await app.request(`/api/calendar/${rbplEventId}/attendance`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(staffAtt.status).toBe(403);
  });

  it("5. Uninvited role rejected on QR scan; Kabid scan succeeds, awards +15 pts, and places Kabid HADIR above Topman BELUM_HADIR", async () => {
    // Staff not in targetRoleIds -> 403
    const staffScan = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: rbplQrPayload }),
    });
    expect(staffScan.status).toBe(403);

    // Kabid in targetRoleIds -> 200 HADIR (+15)
    const kabidScan = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: rbplQrPayload }),
    });
    expect(kabidScan.status).toBe(200);
    const scanJson = await kabidScan.json();
    expect(scanJson.data.status).toBe("HADIR");
    expect(scanJson.data.pointsAwarded).toBe(15);

    // Verify Kader totalScore incremented (10 + 15 = 25)
    const updatedKabid = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.id, kabidId),
    });
    expect(updatedKabid?.totalScore).toBe(25);

    // Attendance table: Kabid (HADIR) MUST come BEFORE Topman (BELUM_HADIR)
    const attAfterKabid = await app.request(
      `/api/calendar/${rbplEventId}/attendance`,
      { headers: { Authorization: `Bearer ${kabidToken}` } }
    );
    expect(attAfterKabid.status).toBe(200);
    const attJson1 = await attAfterKabid.json();
    expect(attJson1.data.totalHadir).toBe(1);
    expect(attJson1.data.rows[0].roleName).toBe("Kabid");
    expect(attJson1.data.rows[0].status).toBe("HADIR");
    expect(attJson1.data.rows[1].roleName).toBe("Topman");
    expect(attJson1.data.rows[1].status).toBe("BELUM_HADIR");

    // Topman also scans -> now BOTH HADIR, sorted Topman BEFORE Kabid!
    const topmanScan = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${topmanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: rbplQrPayload }),
    });
    expect(topmanScan.status).toBe(200);

    const attAfterBoth = await app.request(
      `/api/calendar/${rbplEventId}/attendance`,
      { headers: { Authorization: `Bearer ${topmanToken}` } }
    );
    const attJson2 = await attAfterBoth.json();
    expect(attJson2.data.totalHadir).toBe(2);
    expect(attJson2.data.rows[0].roleName).toBe("Topman");
    expect(attJson2.data.rows[0].status).toBe("HADIR");
    expect(attJson2.data.rows[1].roleName).toBe("Kabid");
    expect(attJson2.data.rows[1].status).toBe("HADIR");

    // Re-scan by Kabid -> idempotent, zero extra points
    const rescan = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: rbplQrPayload }),
    });
    expect(rescan.status).toBe(200);
    const rescanJson = await rescan.json();
    expect(rescanJson.data.alreadyAttended).toBe(true);
    const kabidAfterRescan = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.id, kabidId),
    });
    expect(kabidAfterRescan?.totalScore).toBe(25);
  });

  it("6. Creator can close/reopen QR; non-creator without permission cannot toggle QR; closed QR rejects scan", async () => {
    const kabidToggle = await app.request(`/api/calendar/${rbplEventId}/qr-status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isOpen: false }),
    });
    expect(kabidToggle.status).toBe(403);

    const closeRes = await app.request(`/api/calendar/${rbplEventId}/qr-status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${topmanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isOpen: false }),
    });
    expect(closeRes.status).toBe(200);

    const closedScan = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kabidToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: rbplQrPayload }),
    });
    expect(closedScan.status).toBe(400);
  });

  it("7. Flexible QR works for non-RBPL agendas with 0 points, and rejects foreign QR codes", async () => {
    const prokerEvRes = await app.request("/api/calendar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Workshop Bisnis Terbuka",
        category: "PROKER",
        startAt: "2026-11-22T08:00:00.000Z",
        endAt: "2026-11-22T12:00:00.000Z",
        location: "Auditorium Telkom",
        enableQrAttendance: true,
        pointsPerAttendance: 0,
        targetRoleIds: [],
      }),
    });
    expect(prokerEvRes.status).toBe(201);
    const prokerEvJson = await prokerEvRes.json();
    const prokerQr = prokerEvJson.data.qrPayload;

    const staffScanProker = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: prokerQr }),
    });
    expect(staffScanProker.status).toBe(200);
    const staffScanJson = await staffScanProker.json();
    expect(staffScanJson.data.pointsAwarded).toBe(0);
    expect(staffScanJson.data.status).toBe("HADIR");

    const foreignQr = await app.request("/api/qr/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: JSON.stringify({ app: "OTHER_APP", type: "MEETING" }),
      }),
    });
    expect(foreignQr.status).toBe(400);
  });
});
