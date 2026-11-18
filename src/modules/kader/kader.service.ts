import bcrypt from "bcryptjs";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { kaders, roles, auditLogs } from "../../db/schema/auth.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { parseExcelOrCsv, generateKaderSpreadsheet } from "../../utils/excel.js";
import type {
  CreateCadreInput,
  UpdateCadreInput,
  KaderFilterInput,
} from "./kader.schema.js";

export class KaderService {
  async listRoles() {
    return await db
      .select({
        id: roles.id,
        name: roles.name,
        isSystemDefault: roles.isSystemDefault,
      })
      .from(roles)
      .orderBy(asc(roles.name));
  }

  async listKaders(filter: KaderFilterInput) {
    const conditions = [];

    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(kaders.fullName, pattern),
          ilike(kaders.nim, pattern),
          ilike(kaders.instagram, pattern),
          ilike(kaders.businessName, pattern)
        )
      );
    }

    if (filter.prodi) {
      conditions.push(ilike(kaders.prodi, `%${filter.prodi}%`));
    }

    if (filter.fakultas) {
      conditions.push(ilike(kaders.fakultas, `%${filter.fakultas}%`));
    }

    if (filter.interest) {
      conditions.push(eq(kaders.interestCategory, filter.interest as any));
    }

    if (filter.status) {
      conditions.push(eq(kaders.status, filter.status as any));
    }

    if (filter.roleId) {
      conditions.push(eq(kaders.roleId, filter.roleId));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    // Count total matching
    const totalCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(kaders)
      .where(whereClause);
    const total = Number(totalCountRes[0]?.count || 0);

    // Sorting
    let sortColumn: any = kaders.createdAt;
    if (filter.sortBy === "fullName") sortColumn = kaders.fullName;
    else if (filter.sortBy === "nim") sortColumn = kaders.nim;
    else if (filter.sortBy === "totalScore") sortColumn = kaders.totalScore;

    const orderExpr = filter.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const offset = (filter.page - 1) * filter.limit;

    const rows = await db
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
        createdAt: kaders.createdAt,
        updatedAt: kaders.updatedAt,
        roleId: kaders.roleId,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(filter.limit)
      .offset(offset);

    return {
      data: rows,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.ceil(total / filter.limit) || 1,
      },
    };
  }

  async getKaderById(id: string) {
    const records = await db
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
        createdAt: kaders.createdAt,
        updatedAt: kaders.updatedAt,
        roleId: kaders.roleId,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(eq(kaders.id, id))
      .limit(1);

    if (!records.length) {
      throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
    }

    return records[0];
  }

  async createCadre(input: CreateCadreInput, actorKaderId: string) {
    // Check if NIM already exists
    const existing = await db.query.kaders.findFirst({
      where: eq(kaders.nim, input.nim),
    });

    if (existing) {
      throw new AppError(409, "CONFLICT", "NIM sudah terdaftar");
    }

    const rawPassword = input.password && input.password.trim().length > 0 ? input.password : input.nim;
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const [inserted] = await db
      .insert(kaders)
      .values({
        roleId: input.roleId,
        nim: input.nim,
        passwordHash,
        fullName: input.fullName,
        whatsappNumber: input.whatsappNumber,
        prodi: input.prodi,
        fakultas: input.fakultas,
        instagram: input.instagram,
        businessName: input.businessName,
        interestCategory: input.interestCategory,
        status: input.status || "Aktif",
        totalScore: 0,
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      actorKaderId,
      action: "CREATE_CADRE",
      entityName: "kaders",
      entityId: inserted.id,
      metadata: { nim: inserted.nim },
    });

    const { passwordHash: _, ...safeCadre } = inserted;
    return safeCadre;
  }

  async updateCadre(id: string, input: UpdateCadreInput, actorKaderId: string) {
    const existing = await db.query.kaders.findFirst({
      where: eq(kaders.id, id),
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
    }

    if (input.nim && input.nim !== existing.nim) {
      const duplicate = await db.query.kaders.findFirst({
        where: eq(kaders.nim, input.nim),
      });
      if (duplicate) {
        throw new AppError(409, "CONFLICT", "NIM sudah terdaftar");
      }
    }

    const [updated] = await db
      .update(kaders)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(kaders.id, id))
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      actorKaderId,
      action: "UPDATE_CADRE",
      entityName: "kaders",
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });

    const { passwordHash: _, ...safeCadre } = updated;
    return safeCadre;
  }

  async softDeleteCadre(id: string, actorKaderId: string) {
    const existing = await db.query.kaders.findFirst({
      where: eq(kaders.id, id),
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
    }

    await db
      .update(kaders)
      .set({
        status: "Non-Aktif",
        updatedAt: new Date(),
      })
      .where(eq(kaders.id, id));

    // Audit log
    await db.insert(auditLogs).values({
      actorKaderId,
      action: "DEACTIVATE_CADRE",
      entityName: "kaders",
      entityId: id,
      metadata: { nim: existing.nim },
    });

    return {
      success: true,
      message: "Kader berhasil dinonaktifkan",
    };
  }

  async resetCadrePassword(
    id: string,
    newPassword: string | undefined,
    actorKaderId: string
  ) {
    const existing = await db.query.kaders.findFirst({
      where: eq(kaders.id, id),
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
    }

    const rawPassword =
      newPassword && newPassword.trim().length > 0 ? newPassword.trim() : existing.nim;
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await db
      .update(kaders)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(kaders.id, id));

    await db.insert(auditLogs).values({
      actorKaderId,
      action: "RESET_CADRE_PASSWORD",
      entityName: "kaders",
      entityId: id,
      metadata: {
        nim: existing.nim,
        resetToDefaultNim: !(newPassword && newPassword.trim().length > 0),
      },
    });

    return {
      id: existing.id,
      nim: existing.nim,
      resetToNim: !(newPassword && newPassword.trim().length > 0),
    };
  }

  async importKaders(buffer: Buffer, actorKaderId: string, roleId?: string) {
    const rows = parseExcelOrCsv(buffer);
    if (!rows.length) {
      throw new AppError(400, "BAD_REQUEST", "File import kosong atau kolom NIM tidak ditemukan");
    }

    const allRoles = await db.select().from(roles);
    let targetRoleId =
      allRoles.find((r) => r.name.toLowerCase() === "kader 1")?.id || allRoles[0].id;
    if (roleId) {
      const foundRole = allRoles.find((r) => r.id === roleId);
      if (!foundRole) {
        throw new AppError(400, "VALIDATION_ERROR", "Role yang dipilih tidak ditemukan");
      }
      targetRoleId = foundRole.id;
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ row: number; nim?: string; error: string }> = [];
    const seenInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const nim = rows[i].nim.trim();
      try {
        if (nim.length < 5 || nim.length > 20) {
          throw new AppError(400, "VALIDATION_ERROR", "NIM harus 5–20 karakter");
        }

        if (seenInFile.has(nim)) {
          skipped++;
          continue;
        }
        seenInFile.add(nim);

        const existing = await db.query.kaders.findFirst({
          where: eq(kaders.nim, nim),
        });

        if (existing) {
          // Existing NIM: skip to keep active biodata & password untouched
          skipped++;
          continue;
        }

        const passwordHash = await bcrypt.hash(nim, 10);

        await db.insert(kaders).values({
          roleId: targetRoleId,
          nim,
          passwordHash,
          fullName: `Kader ${nim}`,
          whatsappNumber: "-",
          prodi: "-",
          fakultas: "-",
          interestCategory: "Belum Punya Bisnis",
          status: "Aktif",
          totalScore: 0,
          profileCompleted: false,
        });

        created++;
      } catch (err: any) {
        failed++;
        errors.push({
          row: i + 1,
          nim,
          error: err.message || "Unknown error",
        });
      }
    }

    await db.insert(auditLogs).values({
      actorKaderId,
      action: "IMPORT_CADRES",
      entityName: "kaders",
      entityId: actorKaderId,
      metadata: {
        roleId: targetRoleId,
        totalProcessed: rows.length,
        created,
        skipped,
        failed,
      },
    });

    return {
      totalProcessed: rows.length,
      created,
      skipped,
      updated: 0,
      failed,
      errors,
    };
  }

  async exportKaders(filter: KaderFilterInput, format: "xlsx" | "csv" = "xlsx") {
    // Unpaginated fetch for export matching active filters
    const conditions = [];

    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(kaders.fullName, pattern),
          ilike(kaders.nim, pattern),
          ilike(kaders.instagram, pattern),
          ilike(kaders.businessName, pattern)
        )
      );
    }
    if (filter.prodi) conditions.push(ilike(kaders.prodi, `%${filter.prodi}%`));
    if (filter.fakultas) conditions.push(ilike(kaders.fakultas, `%${filter.fakultas}%`));
    if (filter.interest) conditions.push(eq(kaders.interestCategory, filter.interest as any));
    if (filter.status) conditions.push(eq(kaders.status, filter.status as any));
    if (filter.roleId) conditions.push(eq(kaders.roleId, filter.roleId));

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const kaderList = await db
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
        createdAt: kaders.createdAt,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(whereClause)
      .orderBy(asc(kaders.nim));

    return generateKaderSpreadsheet(kaderList, format);
  }
}

export const kaderService = new KaderService();
