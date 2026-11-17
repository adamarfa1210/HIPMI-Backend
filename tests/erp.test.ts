import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as xlsx from "xlsx";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, roles } from "../src/db/schema/auth.js";
import { scoreLedgers } from "../src/db/schema/erp.js";
import { eq } from "drizzle-orm";

describe("Milestone M2: Core ERP Operational Modules Integration Suite", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let adminUserId: string;
  let testCadreId1: string;
  let testCadreId2: string;
  let staffRoleId: string;

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // 1. Login as Superadmin
    const adminLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220001", password: "admin123" }),
    });
    const adminJson = await adminLoginRes.json();
    adminToken = adminJson.data.accessToken;
    adminUserId = adminJson.data.user.id;

    // 2. Get Staff role
    const staffRole = await dbHelper.db.query.roles.findFirst({
      where: eq(roles.name, "Staff"),
    });
    staffRoleId = staffRole!.id;

    // 3. Create two test cadres for tracking & leaderboard tests
    const passwordHash = await bcrypt.hash("kader123", 10);
    const [c1] = await dbHelper.db
      .insert(kaders)
      .values({
        roleId: staffRoleId,
        nim: "1201220101",
        passwordHash,
        fullName: "Budi Santoso",
        whatsappNumber: "081234567801",
        prodi: "S1 Sistem Informasi",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Punya Bisnis",
        status: "Aktif",
        totalScore: 50,
      })
      .returning();
    testCadreId1 = c1.id;

    const [c2] = await dbHelper.db
      .insert(kaders)
      .values({
        roleId: staffRoleId,
        nim: "1201220102",
        passwordHash,
        fullName: "Siti Rahmawati",
        whatsappNumber: "081234567802",
        prodi: "S1 Teknik Industri",
        fakultas: "Fakultas Rekayasa Industri",
        interestCategory: "Kompetisi",
        status: "Aktif",
        totalScore: 30,
      })
      .returning();
    testCadreId2 = c2.id;
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  // ==========================================
  // SECTION 1: FINANCE MODULE & INVARIANTS
  // ==========================================
  describe("Finance Module & Dynamic Balance Invariants", () => {
    let pendingTxId1: string;
    let pendingTxId2: string;
    let rejectedTxId: string;

    it("1.1 POST /api/finance/transactions records transaction with PENDING status and null receiptNumber", async () => {
      // Create CASH_IN
      const res1 = await app.request("/api/finance/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "CASH_IN",
          fromEntity: "PT Telkom Indonesia",
          toEntity: "HIPMI PT Telkom University",
          amount: 5000000,
          description: "Dana Sponsorship Raker 2026",
          transactionDate: "2026-03-01",
        }),
      });

      expect(res1.status).toBe(201);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.status).toBe("PENDING");
      expect(json1.data.receiptNumber).toBeNull();
      expect(json1.data.amount).toBe(5000000);
      pendingTxId1 = json1.data.id;

      // Create CASH_OUT
      const res2 = await app.request("/api/finance/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "CASH_OUT",
          fromEntity: "HIPMI PT Telkom University",
          toEntity: "Vendor Percetakan Banner",
          amount: 1500000,
          description: "Pembayaran Cetak Banner & Booklet",
          transactionDate: "2026-03-02",
        }),
      });

      expect(res2.status).toBe(201);
      const json2 = await res2.json();
      expect(json2.data.status).toBe("PENDING");
      pendingTxId2 = json2.data.id;

      // Create a 3rd tx to be rejected
      const res3 = await app.request("/api/finance/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "CASH_OUT",
          fromEntity: "HIPMI PT Telkom University",
          toEntity: "Pengeluaran Tak Dikenal",
          amount: 800000,
          description: "Klaim tanpa nota resmi",
          transactionDate: "2026-03-03",
        }),
      });
      rejectedTxId = (await res3.json()).data.id;
    });

    it("1.2 Dynamic Balance Invariant: PENDING transactions strictly DO NOT affect balance", async () => {
      const res = await app.request("/api/finance/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalBalance).toBe(0);
      expect(json.data.totalCashIn).toBe(0);
      expect(json.data.totalCashOut).toBe(0);
    });

    it("1.3 GET /api/finance/transactions/:id/receipt rejects download for PENDING transaction (400 Bad Request)", async () => {
      const res = await app.request(
        `/api/finance/transactions/${pendingTxId1}/receipt`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("APPROVED");
    });

    it("1.4 PATCH /api/finance/transactions/:id/approve approves CASH_IN and generates sequential invoice number INV/HIPMI/YYYY/0001", async () => {
      const year = new Date().getFullYear();
      const expectedInvoice = `INV/HIPMI/${year}/0001`;

      const res = await app.request(
        `/api/finance/transactions/${pendingTxId1}/approve`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "APPROVED" }),
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("APPROVED");
      expect(json.data.receiptNumber).toBe(expectedInvoice);
      expect(json.data.approvedBy).toBe(adminUserId);
      expect(json.data.approvedAt).toBeDefined();
    });

    it("1.5 Dynamic Balance reflects approved CASH_IN strictly (+Rp 5.000.000)", async () => {
      const res = await app.request("/api/finance/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.data.totalBalance).toBe(5000000);
      expect(json.data.totalCashIn).toBe(5000000);
      expect(json.data.totalCashOut).toBe(0);
    });

    it("1.6 Approving CASH_OUT generates next sequential invoice number INV/HIPMI/YYYY/0002 and deducts balance", async () => {
      const year = new Date().getFullYear();
      const expectedInvoice = `INV/HIPMI/${year}/0002`;

      const res = await app.request(
        `/api/finance/transactions/${pendingTxId2}/approve`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "APPROVED" }),
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.receiptNumber).toBe(expectedInvoice);

      // Check balance: 5,000,000 - 1,500,000 = 3,500,000
      const summaryRes = await app.request("/api/finance/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const summaryJson = await summaryRes.json();
      expect(summaryJson.data.totalBalance).toBe(3500000);
      expect(summaryJson.data.totalCashIn).toBe(5000000);
      expect(summaryJson.data.totalCashOut).toBe(1500000);
    });

    it("1.7 Rejecting transaction does not affect balance, and cannot re-process processed transaction", async () => {
      // Reject transaction
      const rejectRes = await app.request(
        `/api/finance/transactions/${rejectedTxId}/approve`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "REJECTED",
            rejectionReason: "Nota tidak valid",
          }),
        }
      );

      expect(rejectRes.status).toBe(200);
      const rejectJson = await rejectRes.json();
      expect(rejectJson.data.status).toBe("REJECTED");
      expect(rejectJson.data.rejectionReason).toBe("Nota tidak valid");

      // Balance remains unchanged (3,500,000)
      const summaryRes = await app.request("/api/finance/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect((await summaryRes.json()).data.totalBalance).toBe(3500000);

      // Attempting to re-approve already processed transaction throws 400
      const reApproveRes = await app.request(
        `/api/finance/transactions/${rejectedTxId}/approve`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "APPROVED" }),
        }
      );
      expect(reApproveRes.status).toBe(400);
    });

    it("1.8 GET /api/finance/transactions/:id/receipt downloads valid PDF receipt buffer", async () => {
      const res = await app.request(
        `/api/finance/transactions/${pendingTxId1}/receipt`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Valid PDF magic header check: starts with %PDF-
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(500);
    });

    it("1.9 GET /api/finance/export exports financial statements to valid Excel (.xlsx) and PDF", async () => {
      // 1. Excel Export
      const excelRes = await app.request("/api/finance/export?format=xlsx", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(excelRes.status).toBe(200);
      expect(excelRes.headers.get("Content-Type")).toContain("spreadsheetml");

      const excelBuffer = Buffer.from(await excelRes.arrayBuffer());
      const wb = xlsx.read(excelBuffer, { type: "buffer" });
      expect(wb.SheetNames).toContain("Transaksi");
      expect(wb.SheetNames).toContain("Ringkasan");

      // 2. PDF Export
      const pdfRes = await app.request("/api/finance/export?format=pdf", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
      const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-");
    });
  });

  // ==========================================
  // SECTION 2: TRACKING & SCORING INVARIANTS
  // ==========================================
  describe("Tracking Prokers, Committee Assignment & Meeting Presensi Scoring", () => {
    let prokerId: string;
    let meetingId: string;

    it("2.1 POST /api/tracking/prokers creates work program under Bidang OKK", async () => {
      const res = await app.request("/api/tracking/prokers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bidang: "OKK",
          title: "HIPMI Camp & Leadership Training 2026",
          picKaderId: testCadreId1,
          startDate: "2026-05-10",
          endDate: "2026-05-12",
          status: "PLANNED",
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("HIPMI Camp & Leadership Training 2026");
      expect(json.data.bidang).toBe("OKK");
      prokerId = json.data.id;
    });

    it("2.2 POST /api/tracking/prokers/:id/committees atomically inserts committee, credits score_ledgers, and increments kader totalScore", async () => {
      // Prior score of testCadreId1 is 50
      const initialScore = 50;
      const pointsToAward = 25;

      const res = await app.request(
        `/api/tracking/prokers/${prokerId}/committees`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kaderId: testCadreId1,
            committeeRole: "Ketua Pelaksana",
            pointsAwarded: pointsToAward,
          }),
        }
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.pointsAwarded).toBe(25);

      // Verify DB totalScore incremented: 50 + 25 = 75
      const cadre = await dbHelper.db.query.kaders.findFirst({
        where: eq(kaders.id, testCadreId1),
      });
      expect(cadre!.totalScore).toBe(initialScore + pointsToAward);

      // Verify transparent score_ledgers entry exists
      const ledgers = await dbHelper.db.query.scoreLedgers.findMany({
        where: eq(scoreLedgers.kaderId, testCadreId1),
      });
      const committeeLedger = ledgers.find(
        (l) => l.sourceType === "PROKER_COMMITTEE"
      );
      expect(committeeLedger).toBeDefined();
      expect(committeeLedger!.points).toBe(25);
      expect(committeeLedger!.description).toContain("Ketua Pelaksana");
    });

    it("2.3 Duplicate committee assignment to same proker is rejected with 400 Bad Request", async () => {
      const res = await app.request(
        `/api/tracking/prokers/${prokerId}/committees`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kaderId: testCadreId1,
            committeeRole: "Ketua Pelaksana",
            pointsAwarded: 25,
          }),
        }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("sudah terdaftar");
    });

    it("2.4 POST /api/tracking/meetings creates meeting session and pointsPerAttendance", async () => {
      const res = await app.request("/api/tracking/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prokerId,
          title: "Rapat Koordinasi Perdana Kepanitiaan",
          meetingDate: "2026-04-15T19:00:00.000Z",
          pointsPerAttendance: 10,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.pointsPerAttendance).toBe(10);
      meetingId = json.data.id;
    });

    it("2.5 Presensi Scoring: Status HADIR inserts positive ledger and increments totalScore", async () => {
      // testCadreId2 starts with totalScore = 30
      const initialScore = 30;
      const res = await app.request(
        `/api/tracking/meetings/${meetingId}/attendances`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            attendances: [
              {
                kaderId: testCadreId2,
                status: "HADIR",
              },
            ],
          }),
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].status).toBe("HADIR");

      // Verify totalScore increased by 10 (30 -> 40)
      const cadre = await dbHelper.db.query.kaders.findFirst({
        where: eq(kaders.id, testCadreId2),
      });
      expect(cadre!.totalScore).toBe(initialScore + 10);
    });

    it("2.6 Idempotency Invariant: Submitting HADIR repeatedly does NOT award duplicate points", async () => {
      const res = await app.request(
        `/api/tracking/meetings/${meetingId}/attendances`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            attendances: [
              {
                kaderId: testCadreId2,
                status: "HADIR",
              },
            ],
          }),
        }
      );

      expect(res.status).toBe(200);

      // Score must remain 40, not 50
      const cadre = await dbHelper.db.query.kaders.findFirst({
        where: eq(kaders.id, testCadreId2),
      });
      expect(cadre!.totalScore).toBe(40);
    });

    it("2.7 Reversal Invariant: Changing status from HADIR to IZIN inserts compensating negative ledger and decrements totalScore", async () => {
      const res = await app.request(
        `/api/tracking/meetings/${meetingId}/attendances`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            attendances: [
              {
                kaderId: testCadreId2,
                status: "IZIN",
              },
            ],
          }),
        }
      );

      expect(res.status).toBe(200);

      // Total score must be rolled back by 10 (40 -> 30)
      const cadre = await dbHelper.db.query.kaders.findFirst({
        where: eq(kaders.id, testCadreId2),
      });
      expect(cadre!.totalScore).toBe(30);

      // Check that a compensating negative ledger entry exists
      const ledgers = await dbHelper.db.query.scoreLedgers.findMany({
        where: eq(scoreLedgers.kaderId, testCadreId2),
      });
      const reversalLedger = ledgers.find((l) => l.points === -10);
      expect(reversalLedger).toBeDefined();
      expect(reversalLedger!.description).toContain("IZIN");
    });

    it("2.8 GET /api/tracking/prokers/:id returns proker detail with assigned committees and meetings", async () => {
      const res = await app.request(`/api/tracking/prokers/${prokerId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(prokerId);
      expect(Array.isArray(json.data.committees)).toBe(true);
      expect(json.data.committees.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(json.data.meetings)).toBe(true);
      expect(json.data.meetings.length).toBeGreaterThanOrEqual(1);
    });

    it("2.9 GET /api/tracking/meetings returns meetings list with attendance counts", async () => {
      const res = await app.request(`/api/tracking/meetings?prokerId=${prokerId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].attendanceCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // SECTION 3: LEADERBOARD & AUDIT HISTORY
  // ==========================================
  describe("Leaderboard Ranking & Cadre Point Audit Ledger", () => {
    it("3.1 GET /api/leaderboard returns ranked active cadres sorted by totalScore DESC and currentUserRank", async () => {
      const res = await app.request("/api/leaderboard?page=1&limit=10", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.leaderboard)).toBe(true);
      expect(json.data.currentUserRank).toBeDefined();

      // Check sorting by totalScore DESC
      const list = json.data.leaderboard;
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].totalScore).toBeGreaterThanOrEqual(list[i + 1].totalScore);
        expect(list[i].rank).toBeLessThanOrEqual(list[i + 1].rank);
      }
    });

    it("3.2 GET /api/leaderboard/kaders/:id/ledger returns complete transparent score ledger audit trail", async () => {
      const res = await app.request(
        `/api/leaderboard/kaders/${testCadreId1}/ledger`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.kader.id).toBe(testCadreId1);
      expect(Array.isArray(json.data.ledgers)).toBe(true);
      expect(json.data.ledgers.length).toBeGreaterThanOrEqual(1);
      expect(json.data.ledgers[0].points).toBe(25);
    });
  });

  // ==========================================
  // SECTION 4: CALENDAR MODULE
  // ==========================================
  describe("Calendar Module & Public Schedule Feed", () => {
    let publicEventId: string;

    it("4.1 POST /api/calendar creates internal calendar event with graceful Google fallback", async () => {
      const res = await app.request("/api/calendar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Rapat Pleno BPH HIPMI PT Telkom",
          category: "INTERNAL_MEETING",
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T12:00:00.000Z",
          location: "Ruang Rapat Gedung Damar Lantai 2",
          isPublic: false,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("Rapat Pleno BPH HIPMI PT Telkom");
      expect(json.data.isPublic).toBe(false);
    });

    it("4.2 POST /api/calendar creates public event and GET /api/public/calendar serves public feed without auth", async () => {
      // 1. Create public event
      const createRes = await app.request("/api/calendar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "HIPMI Business Festival & Expo 2026",
          category: "PROKER",
          startAt: "2026-07-15T09:00:00.000Z",
          endAt: "2026-07-16T17:00:00.000Z",
          location: "Telkom University Convention Hall (TUCH)",
          isPublic: true,
        }),
      });

      expect(createRes.status).toBe(201);
      publicEventId = (await createRes.json()).data.id;

      // 2. Query public feed without any auth header
      const publicRes = await app.request("/api/public/calendar", {
        method: "GET",
      });

      expect(publicRes.status).toBe(200);
      const publicJson = await publicRes.json();
      expect(publicJson.success).toBe(true);
      expect(Array.isArray(publicJson.data)).toBe(true);

      const foundPublic = publicJson.data.find(
        (e: any) => e.id === publicEventId
      );
      expect(foundPublic).toBeDefined();
      expect(foundPublic.title).toBe("HIPMI Business Festival & Expo 2026");
    });
  });

  // ==========================================
  // SECTION 5: DASHBOARD EXECUTIVE SUMMARY
  // ==========================================
  describe("Dashboard Executive KPI Analytics", () => {
    it("5.1 GET /api/dashboard/summary calculates accurate activity index, cadres, balance, and agendas", async () => {
      const res = await app.request("/api/dashboard/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const { data } = json;
      expect(data.totalCadres).toBeGreaterThanOrEqual(3); // superadmin + 2 created
      expect(data.activeCadres).toBeGreaterThanOrEqual(3);
      expect(data.cadreActivityIndex).toBeGreaterThan(0);
      // Approved balance from Section 1 tests is Rp 3.500.000
      expect(data.currentBalance).toBe(3500000);

      expect(data.prokerDistribution).toBeDefined();
      expect(data.prokerDistribution.total).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.upcomingAgendas)).toBe(true);
    });
  });

  // ==========================================
  // SECTION 6: DOCUMENTS REPOSITORY
  // ==========================================
  describe("Documents Repository & Official Templates", () => {
    it("6.1 GET /api/documents/templates returns Google Docs template URL", async () => {
      const res = await app.request("/api/documents/templates", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.googleDocsTemplateUrl).toBeDefined();
      expect(json.data.googleDocsTemplateUrl).toContain("docs.google.com");
    });

    it("6.2 GET /api/documents returns organizational documents list", async () => {
      const res = await app.request("/api/documents", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });
  });
});
