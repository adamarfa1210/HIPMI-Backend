import type { Context, Next } from "hono";
import { verifyAccessToken } from "../utils/jwt.js";
import { db } from "../db/index.js";
import { kaders, roles } from "../db/schema/auth.js";
import { eq } from "drizzle-orm";

export interface AuthUser {
  id: string;
  nim: string;
  fullName: string;
  name?: string;
  roleId: string;
  roleName: string;
  roleCode?: string;
  status: string;
  totalScore: number;
  fakultas: string;
  prodi: string;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization") || c.req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        message: "Token otentikasi tidak ditemukan",
        error: {
          code: "UNAUTHORIZED",
          message: "Token otentikasi tidak ditemukan",
        },
      },
      401
    );
  }

  const token = authHeader.substring(7).trim();
  const payload = await verifyAccessToken(token);
  const userId = payload?.sub || payload?.id;

  if (!payload || !userId) {
    return c.json(
      {
        success: false,
        message: "Token otentikasi tidak valid atau telah kedaluwarsa",
        error: {
          code: "UNAUTHORIZED",
          message: "Token otentikasi tidak valid atau telah kedaluwarsa",
        },
      },
      401
    );
  }

  // Lookup cadre in database
  const cadreRecord = await db
    .select({
      id: kaders.id,
      nim: kaders.nim,
      fullName: kaders.fullName,
      roleId: kaders.roleId,
      roleName: roles.name,
      status: kaders.status,
      totalScore: kaders.totalScore,
      fakultas: kaders.fakultas,
      prodi: kaders.prodi,
    })
    .from(kaders)
    .innerJoin(roles, eq(kaders.roleId, roles.id))
    .where(eq(kaders.id, userId as string))
    .limit(1);

  if (!cadreRecord.length) {
    return c.json(
      {
        success: false,
        message: "Pengguna tidak ditemukan",
        error: {
          code: "UNAUTHORIZED",
          message: "Pengguna tidak ditemukan",
        },
      },
      401
    );
  }

  const cadre = cadreRecord[0];
  if (cadre.status !== "Aktif") {
    return c.json(
      {
        success: false,
        message: "Pengguna tidak aktif atau ditangguhkan",
        error: {
          code: "UNAUTHORIZED",
          message: "Pengguna tidak aktif atau ditangguhkan",
        },
      },
      401
    );
  }

  const authUser: AuthUser = {
    id: cadre.id,
    nim: cadre.nim,
    fullName: cadre.fullName,
    name: cadre.fullName,
    roleId: cadre.roleId,
    roleName: cadre.roleName,
    roleCode: cadre.roleName.toLowerCase().replace(/\s+/g, "_"),
    status: cadre.status,
    totalScore: cadre.totalScore,
    fakultas: cadre.fakultas,
    prodi: cadre.prodi,
  };

  c.set("user", authUser);
  return await next();
};
