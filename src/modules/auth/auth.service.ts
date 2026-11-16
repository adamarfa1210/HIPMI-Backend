import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { kaders, roles, modules, rolePermissions, auditLogs } from "../../db/schema/auth.js";
import { signAccessToken } from "../../utils/jwt.js";
import { AppError } from "../../middlewares/error.middleware.js";
import type { LoginInput, ChangePasswordInput } from "./auth.schema.js";

export class AuthService {
  async login(input: LoginInput) {
    const cadreRecord = await db
      .select({
        id: kaders.id,
        nim: kaders.nim,
        passwordHash: kaders.passwordHash,
        fullName: kaders.fullName,
        whatsappNumber: kaders.whatsappNumber,
        prodi: kaders.prodi,
        fakultas: kaders.fakultas,
        instagram: kaders.instagram,
        businessName: kaders.businessName,
        interestCategory: kaders.interestCategory,
        status: kaders.status,
        totalScore: kaders.totalScore,
        roleId: kaders.roleId,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(eq(kaders.nim, input.nim))
      .limit(1);

    if (!cadreRecord.length) {
      throw new AppError(401, "UNAUTHORIZED", "NIM atau password salah");
    }

    const cadre = cadreRecord[0];

    // Inactive status check
    if (cadre.status === "Non-Aktif") {
      throw new AppError(401, "UNAUTHORIZED", "Pengguna tidak aktif atau tidak ditemukan");
    }

    const isMatch = await bcrypt.compare(input.password, cadre.passwordHash);
    if (!isMatch) {
      throw new AppError(401, "UNAUTHORIZED", "NIM atau password salah");
    }

    // Fetch permissions
    const perms = await db
      .select({
        moduleId: modules.id,
        moduleCode: modules.code,
        moduleLabel: modules.label,
        canRead: rolePermissions.canRead,
        canCreate: rolePermissions.canCreate,
        canUpdate: rolePermissions.canUpdate,
        canDelete: rolePermissions.canDelete,
        canApprove: rolePermissions.canApprove,
      })
      .from(rolePermissions)
      .innerJoin(modules, eq(rolePermissions.moduleId, modules.id))
      .where(eq(rolePermissions.roleId, cadre.roleId));

    const roleCode = cadre.roleName.toLowerCase().replace(/\s+/g, "_");

    const accessToken = await signAccessToken({
      sub: cadre.id,
      id: cadre.id,
      nim: cadre.nim,
      fullName: cadre.fullName,
      name: cadre.fullName,
      roleId: cadre.roleId,
      roleName: cadre.roleName,
      roleCode,
      fakultas: cadre.fakultas,
      prodi: cadre.prodi,
      status: cadre.status,
      totalScore: cadre.totalScore,
    });

    const { passwordHash: _, ...safeUser } = cadre;

    return {
      accessToken,
      user: {
        ...safeUser,
        roleCode,
      },
      permissions: perms,
    };
  }

  async getMe(userId: string) {
    const cadreRecord = await db
      .select({
        id: kaders.id,
        nim: kaders.nim,
        fullName: kaders.fullName,
        whatsappNumber: kaders.whatsappNumber,
        prodi: kaders.prodi,
        fakultas: kaders.fakultas,
        instagram: kaders.instagram,
        businessName: kaders.businessName,
        interestCategory: kaders.interestCategory,
        status: kaders.status,
        totalScore: kaders.totalScore,
        roleId: kaders.roleId,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(eq(kaders.id, userId))
      .limit(1);

    if (!cadreRecord.length) {
      throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan");
    }

    const cadre = cadreRecord[0];

    const perms = await db
      .select({
        moduleId: modules.id,
        moduleCode: modules.code,
        moduleLabel: modules.label,
        canRead: rolePermissions.canRead,
        canCreate: rolePermissions.canCreate,
        canUpdate: rolePermissions.canUpdate,
        canDelete: rolePermissions.canDelete,
        canApprove: rolePermissions.canApprove,
      })
      .from(rolePermissions)
      .innerJoin(modules, eq(rolePermissions.moduleId, modules.id))
      .where(eq(rolePermissions.roleId, cadre.roleId));

    return {
      user: cadre,
      role: {
        id: cadre.roleId,
        name: cadre.roleName,
      },
      permissions: perms,
      totalScore: cadre.totalScore,
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const cadreRecord = await db
      .select()
      .from(kaders)
      .where(eq(kaders.id, userId))
      .limit(1);

    if (!cadreRecord.length) {
      throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan");
    }

    const cadre = cadreRecord[0];

    const isMatch = await bcrypt.compare(input.oldPassword, cadre.passwordHash);
    if (!isMatch) {
      throw new AppError(400, "BAD_REQUEST", "Password lama salah");
    }

    const newHash = await bcrypt.hash(input.newPassword, 10);

    await db
      .update(kaders)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(kaders.id, userId));

    // Audit log
    await db.insert(auditLogs).values({
      actorKaderId: userId,
      action: "CHANGE_PASSWORD",
      entityName: "kaders",
      entityId: userId,
      metadata: { timestamp: new Date().toISOString() },
    });

    return {
      success: true,
      message: "Password berhasil diperbarui",
    };
  }
}

export const authService = new AuthService();
