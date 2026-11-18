import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  kaders,
  roles,
  modules,
  rolePermissions,
  auditLogs,
  passwordResetRequests,
} from "../../db/schema/auth.js";
import { signAccessToken } from "../../utils/jwt.js";
import { AppError } from "../../middlewares/error.middleware.js";
import type {
  LoginInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  CompleteOnboardingInput,
  UpdateProfileInput,
} from "./auth.schema.js";

export type OnboardingMode = "none" | "complete-profile" | "reset-password";

export class AuthService {
  private async resolveOnboardingMode(
    nim: string,
    passwordHash: string,
    profileCompleted: boolean
  ): Promise<OnboardingMode> {
    const passwordIsNim = await bcrypt.compare(nim, passwordHash);
    if (!passwordIsNim) return "none";
    return profileCompleted ? "reset-password" : "complete-profile";
  }

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
        profileCompleted: kaders.profileCompleted,
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

    const onboardingMode = await this.resolveOnboardingMode(
      cadre.nim,
      cadre.passwordHash,
      cadre.profileCompleted
    );

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
        onboardingMode,
      },
      permissions: perms,
    };
  }

  async getMe(userId: string) {
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
        profileCompleted: kaders.profileCompleted,
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
    const onboardingMode = await this.resolveOnboardingMode(
      cadre.nim,
      cadre.passwordHash,
      cadre.profileCompleted
    );
    const { passwordHash: _, ...safeCadre } = cadre;

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
      user: {
        ...safeCadre,
        onboardingMode,
      },
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

    if (input.newPassword.trim() === cadre.nim) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Password baru tidak boleh sama dengan NIM Anda"
      );
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

  async requestForgotPassword(input: ForgotPasswordInput) {
    const nim = input.nim.trim();
    const cadre = await db.query.kaders.findFirst({
      where: eq(kaders.nim, nim),
    });

    if (!cadre) {
      throw new AppError(404, "NOT_FOUND", "NIM tidak terdaftar di sistem HIPMI PT Telkom");
    }

    if (cadre.status === "Non-Aktif") {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Akun dengan NIM ini berstatus Non-Aktif. Hubungi pengurus/admin."
      );
    }

    const existingPending = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.kaderId, cadre.id),
          eq(passwordResetRequests.status, "PENDING")
        )
      )
      .limit(1);

    if (existingPending.length > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        "Permintaan reset password untuk NIM ini sudah dikirim dan sedang menunggu ACC Admin."
      );
    }

    const [created] = await db
      .insert(passwordResetRequests)
      .values({
        kaderId: cadre.id,
        nim: cadre.nim,
        status: "PENDING",
      })
      .returning();

    await db.insert(auditLogs).values({
      actorKaderId: cadre.id,
      action: "REQUEST_PASSWORD_RESET",
      entityName: "password_reset_requests",
      entityId: created.id,
      metadata: { nim: cadre.nim },
    });

    return {
      message:
        "Permintaan reset password berhasil diajukan. Tunggu ACC Admin, lalu login menggunakan NIM sebagai password sementara.",
      data: {
        id: created.id,
        nim: created.nim,
        status: created.status,
        requestedAt: created.requestedAt,
      },
    };
  }

  async completeOnboarding(userId: string, input: CompleteOnboardingInput) {
    const cadre = await db.query.kaders.findFirst({
      where: eq(kaders.id, userId),
    });

    if (!cadre) {
      throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan");
    }

    const nextPassword = input.newPassword.trim();
    if (nextPassword === cadre.nim) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Password baru tidak boleh sama dengan NIM Anda"
      );
    }

    const updates: Record<string, any> = {
      passwordHash: await bcrypt.hash(nextPassword, 10),
      profileCompleted: true,
      updatedAt: new Date(),
    };

    if (!cadre.profileCompleted) {
      if (
        !input.fullName ||
        !input.whatsappNumber ||
        !input.prodi ||
        !input.fakultas ||
        !input.interestCategory
      ) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Lengkapi Nama Lengkap, WhatsApp, Prodi, Fakultas, dan Kategori Minat Bisnis terlebih dahulu"
        );
      }
      updates.fullName = input.fullName;
      updates.whatsappNumber = input.whatsappNumber;
      updates.prodi = input.prodi;
      updates.fakultas = input.fakultas;
      updates.interestCategory = input.interestCategory;
      if (input.instagram !== undefined) updates.instagram = input.instagram || null;
      if (input.businessName !== undefined) updates.businessName = input.businessName || null;
    }

    await db.update(kaders).set(updates).where(eq(kaders.id, userId));

    await db.insert(auditLogs).values({
      actorKaderId: userId,
      action: cadre.profileCompleted ? "COMPLETE_PASSWORD_RESET" : "COMPLETE_ONBOARDING",
      entityName: "kaders",
      entityId: userId,
      metadata: { nim: cadre.nim },
    });

    return await this.getMe(userId);
  }

  async updateOwnProfile(userId: string, input: UpdateProfileInput) {
    const cadre = await db.query.kaders.findFirst({
      where: eq(kaders.id, userId),
    });

    if (!cadre) {
      throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan");
    }

    await db
      .update(kaders)
      .set({
        fullName: input.fullName,
        whatsappNumber: input.whatsappNumber,
        prodi: input.prodi,
        fakultas: input.fakultas,
        instagram: input.instagram ? input.instagram : null,
        businessName: input.businessName ? input.businessName : null,
        interestCategory: input.interestCategory,
        profileCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(kaders.id, userId));

    await db.insert(auditLogs).values({
      actorKaderId: userId,
      action: "UPDATE_OWN_PROFILE",
      entityName: "kaders",
      entityId: userId,
      metadata: { nim: cadre.nim },
    });

    return await this.getMe(userId);
  }
}

export const authService = new AuthService();
