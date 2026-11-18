import bcrypt from "bcryptjs";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  auditLogs,
  kaders,
  passwordResetRequests,
  roles,
} from "../../db/schema/auth.js";
import { AppError } from "../../middlewares/error.middleware.js";

export type ResetRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export class PasswordResetService {
  async getPendingCount(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.status, "PENDING"));
    return Number(row?.count ?? 0);
  }

  async listRequests(status?: ResetRequestStatus) {
    const items = await db
      .select({
        id: passwordResetRequests.id,
        kaderId: passwordResetRequests.kaderId,
        nim: passwordResetRequests.nim,
        status: passwordResetRequests.status,
        requestedAt: passwordResetRequests.requestedAt,
        resolvedBy: passwordResetRequests.resolvedBy,
        resolvedAt: passwordResetRequests.resolvedAt,
        notes: passwordResetRequests.notes,
        fullName: kaders.fullName,
        whatsappNumber: kaders.whatsappNumber,
        prodi: kaders.prodi,
        fakultas: kaders.fakultas,
        profileCompleted: kaders.profileCompleted,
        roleName: roles.name,
      })
      .from(passwordResetRequests)
      .innerJoin(kaders, eq(passwordResetRequests.kaderId, kaders.id))
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(status ? eq(passwordResetRequests.status, status) : undefined)
      .orderBy(desc(passwordResetRequests.requestedAt));

    const pendingCount = await this.getPendingCount();

    return {
      items,
      pendingCount,
    };
  }

  async approveRequest(id: string, actorKaderId: string, notes?: string) {
    const existing = await db.query.passwordResetRequests.findFirst({
      where: eq(passwordResetRequests.id, id),
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Pengajuan reset password tidak ditemukan");
    }

    if (existing.status !== "PENDING") {
      throw new AppError(400, "BAD_REQUEST", "Pengajuan ini sudah diproses sebelumnya");
    }

    const cadre = await db.query.kaders.findFirst({
      where: eq(kaders.id, existing.kaderId),
    });

    if (!cadre) {
      throw new AppError(404, "NOT_FOUND", "Akun kader tidak ditemukan");
    }

    const passwordHash = await bcrypt.hash(cadre.nim, 10);
    const now = new Date();

    const [updated] = await db.transaction(async (tx) => {
      await tx
        .update(kaders)
        .set({
          passwordHash,
          updatedAt: now,
        })
        .where(eq(kaders.id, cadre.id));

      return await tx
        .update(passwordResetRequests)
        .set({
          status: "APPROVED",
          resolvedBy: actorKaderId,
          resolvedAt: now,
          notes: notes?.trim() || "Disetujui — Password direset sama dengan NIM",
        })
        .where(eq(passwordResetRequests.id, id))
        .returning();
    });

    await db.insert(auditLogs).values({
      actorKaderId,
      action: "APPROVE_PASSWORD_RESET",
      entityName: "password_reset_requests",
      entityId: id,
      metadata: {
        nim: cadre.nim,
        kaderId: cadre.id,
      },
    });

    return updated;
  }

  async rejectRequest(id: string, actorKaderId: string, notes?: string) {
    const existing = await db.query.passwordResetRequests.findFirst({
      where: eq(passwordResetRequests.id, id),
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Pengajuan reset password tidak ditemukan");
    }

    if (existing.status !== "PENDING") {
      throw new AppError(400, "BAD_REQUEST", "Pengajuan ini sudah diproses sebelumnya");
    }

    const [updated] = await db
      .update(passwordResetRequests)
      .set({
        status: "REJECTED",
        resolvedBy: actorKaderId,
        resolvedAt: new Date(),
        notes: notes?.trim() || "Ditolak oleh pemeriksa",
      })
      .where(eq(passwordResetRequests.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorKaderId,
      action: "REJECT_PASSWORD_RESET",
      entityName: "password_reset_requests",
      entityId: id,
      metadata: {
        nim: existing.nim,
        notes: notes || null,
      },
    });

    return updated;
  }
}

export const passwordResetService = new PasswordResetService();
