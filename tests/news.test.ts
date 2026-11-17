import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { createTestDatabase } from "./helpers/test-db.js";
import { kaders, roles } from "../src/db/schema/auth.js";
import { eq } from "drizzle-orm";

describe("News Module: Placement Tag Isolation (INTERNAL / PUBLIC / BOTH) & RBAC", () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let kaderToken: string;
  let internalId: string;
  let publicId: string;
  let bothId: string;

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
    const hash = await bcrypt.hash("kader123", 10);
    await dbHelper.db.insert(kaders).values({
      roleId: kader1Role!.id,
      nim: "1201220777",
      passwordHash: hash,
      fullName: "Kader Pembaca Berita",
      whatsappNumber: "081234567777",
      prodi: "S1 Sistem Informasi",
      fakultas: "Fakultas Rekayasa Industri",
      interestCategory: "Kompetisi",
      status: "Aktif",
    });

    const kaderLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nim: "1201220777", password: "kader123" }),
    });
    kaderToken = (await kaderLogin.json()).data.accessToken;
  });

  afterAll(async () => {
    await dbHelper.cleanup();
  });

  it("1. Admin/Editor creates INTERNAL, PUBLIC, and BOTH news; Kader 1 is blocked (403) from /api/news/manage", async () => {
    const forbiddenRes = await app.request("/api/news/manage", {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    expect(forbiddenRes.status).toBe(403);

    const makeNews = async (payload: Record<string, any>) => {
      const res = await app.request("/api/news/manage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      return (await res.json()).data.id as string;
    };

    internalId = await makeNews({
      title: "Memo Rapat Internal Pengurus",
      category: "Pengumuman",
      summary: "Ringkasan jadwal evaluasi internal divisi.",
      content: "Detail lengkap agenda evaluasi internal seluruh pengurus HIPMI PT Telkom.",
      targetAudience: "INTERNAL",
      isFeatured: false,
      isPublished: true,
    });

    publicId = await makeNews({
      title: "Open Recruitment HIPMI PT Telkom 2026",
      category: "Kegiatan",
      summary: "Pendaftaran anggota baru HIPMI PT Telkom resmi dibuka.",
      content: "Informasi lengkap mengenai timeline, syarat pendaftaran, dan benefit menjadi anggota UKM HIPMI PT Telkom.",
      targetAudience: "PUBLIC",
      isFeatured: true,
      isPublished: true,
    });

    bothId = await makeNews({
      title: "Delegasi HIPMI Juara Kompetisi Bisnis Nasional",
      category: "Prestasi",
      summary: "Tim delegasi kader berhasil meraih juara 1 tingkat nasional.",
      content: "Laporan lengkap pencapaian tim delegasi HIPMI PT Universitas Telkom pada ajang kompetisi bisnis.",
      targetAudience: "BOTH",
      isFeatured: false,
      isPublished: true,
    });
  });

  it("2. Internal feed (/api/news) serves INTERNAL + BOTH only; Public feed (/api/public/news) serves PUBLIC + BOTH only", async () => {
    const internalRes = await app.request("/api/news", {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    expect(internalRes.status).toBe(200);
    const internalIds = (await internalRes.json()).data.map((n: any) => n.id);
    expect(internalIds).toContain(internalId);
    expect(internalIds).toContain(bothId);
    expect(internalIds).not.toContain(publicId);

    const publicRes = await app.request("/api/public/news");
    expect(publicRes.status).toBe(200);
    const publicList = (await publicRes.json()).data;
    const publicIds = publicList.map((n: any) => n.id);
    expect(publicIds).toContain(publicId);
    expect(publicIds).toContain(bothId);
    expect(publicIds).not.toContain(internalId);
    expect(publicList[0].id).toBe(publicId); // isFeatured comes first
  });

  it("3. PATCH & DELETE /api/news/manage/:id update and delete news article", async () => {
    const patchRes = await app.request(`/api/news/manage/${bothId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isFeatured: true, targetAudience: "PUBLIC" }),
    });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).data.targetAudience).toBe("PUBLIC");

    const delRes = await app.request(`/api/news/manage/${internalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);
  });

  it("4. PATCH /api/news/manage/reorder shifts priority order and reflects immediately in /api/public/news", async () => {
    const reorderRes = await app.request("/api/news/manage/reorder", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderedIds: [bothId, publicId] }),
    });
    expect(reorderRes.status).toBe(200);

    const publicRes = await app.request("/api/public/news");
    expect(publicRes.status).toBe(200);
    const list = (await publicRes.json()).data as Array<{ id: string; sortOrder: number }>;
    expect(list.map((n) => n.id)).toEqual([bothId, publicId]);
    expect(list[0].sortOrder).toBe(1);
    expect(list[1].sortOrder).toBe(2);
  });
});
