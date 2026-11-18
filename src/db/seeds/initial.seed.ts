import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, closeDbConnection } from "../index.js";
import { roles, modules, rolePermissions, kaders } from "../schema/auth.js";

export const DEFAULT_ROLES = [
  { name: "Admin", isSystemDefault: true },
  { name: "Topman", isSystemDefault: true },
  { name: "Kabid", isSystemDefault: true },
  { name: "Kadiv", isSystemDefault: true },
  { name: "Staff", isSystemDefault: true },
  { name: "Kader 1", isSystemDefault: true },
];

export const DEFAULT_MODULES = [
  { code: "kaders", label: "Database Kader" },
  { code: "dashboard", label: "Dashboard Utama" },
  { code: "finance-request", label: "Pengajuan Keuangan" },
  { code: "finance", label: "Persetujuan & Kas Keuangan" },
  { code: "tracking", label: "Tracking Kader & Scoring" },
  { code: "leaderboard", label: "Leaderboard" },
  { code: "calendar", label: "Calendar HIPMI" },
  { code: "rbpl", label: "RBPL (Rapat Badan Pengurus Lengkap)" },
  { code: "qr-scanner", label: "Kamera Scan QR ERP" },
  { code: "documents", label: "Template Surat & Dokumen" },
  { code: "cms", label: "CMS Web Profile" },
  { code: "news", label: "Berita HIPMI (Konsumsi)" },
  { code: "news-manage", label: "Setting Berita (Kelola)" },
  { code: "profile", label: "Settings Profile" },
  { code: "password-reset", label: "ACC Reset Password" },
  { code: "admin-rbac", label: "Admin Role Matrix & RBAC" },
];

export interface PermissionFlags {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export function getPermissionFlags(roleName: string, moduleCode: string): PermissionFlags {
  if (roleName === "Admin") {
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
    };
  }

  const flags: PermissionFlags = {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
  };

  switch (moduleCode) {
    case "kaders":
      if (["Topman", "Kabid", "Kadiv", "Staff"].includes(roleName)) {
        flags.canRead = true;
      }
      if (roleName === "Topman") {
        flags.canCreate = true;
        flags.canUpdate = true;
      }
      break;

    case "dashboard":
      flags.canRead = true; // All roles can view dashboard
      break;

    case "finance-request":
      if (["Topman", "Kabid", "Kadiv", "Staff"].includes(roleName)) {
        flags.canRead = true;
        flags.canCreate = true;
      }
      break;

    case "finance":
      if (roleName === "Topman") {
        flags.canRead = true;
        flags.canApprove = true;
      }
      break;

    case "tracking":
      if (["Topman", "Kabid", "Kadiv"].includes(roleName)) {
        flags.canRead = true;
        flags.canCreate = true;
        flags.canUpdate = true;
      }
      if (["Topman", "Kabid"].includes(roleName)) {
        flags.canApprove = true;
      }
      if (roleName === "Staff") {
        flags.canRead = true;
      }
      break;

    case "leaderboard":
    case "calendar":
    case "documents":
      flags.canRead = true; // Open read for all roles
      if (["Topman", "Kabid", "Kadiv"].includes(roleName) && moduleCode === "calendar") {
        flags.canCreate = true;
        flags.canUpdate = true;
      }
      if (roleName === "Topman" && moduleCode === "documents") {
        flags.canCreate = true;
        flags.canUpdate = true;
      }
      break;

    case "cms":
      if (["Topman", "Kabid"].includes(roleName)) {
        flags.canRead = true;
      }
      if (roleName === "Topman") {
        flags.canCreate = true;
        flags.canUpdate = true;
      }
      break;

    case "news":
      flags.canRead = true;
      break;

    case "news-manage":
      if (["Topman", "Kabid"].includes(roleName)) {
        flags.canRead = true;
        flags.canCreate = true;
        flags.canUpdate = true;
        flags.canDelete = true;
      }
      break;

    case "rbpl":
    case "qr-scanner":
    case "profile":
    case "password-reset":
    case "admin-rbac":
      // Unbound by role: non-admin flags start false and are configured dynamically via Settings Hak Akses
      break;
  }

  return flags;
}

export async function seedDatabase(targetDb: any = db) {
  console.log("Starting database seeding...");

  // 1. Seed Roles
  const insertedRoles = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const existing = await targetDb.query.roles.findFirst({
      where: eq(roles.name, r.name),
    });
    if (existing) {
      insertedRoles.set(r.name, existing.id);
    } else {
      const [inserted] = await targetDb.insert(roles).values(r).returning();
      insertedRoles.set(r.name, inserted.id);
    }
  }

  // 2. Seed Modules
  const insertedModules = new Map<string, string>();
  for (const m of DEFAULT_MODULES) {
    const existing = await targetDb.query.modules.findFirst({
      where: eq(modules.code, m.code),
    });
    if (existing) {
      insertedModules.set(m.code, existing.id);
    } else {
      const [inserted] = await targetDb.insert(modules).values(m).returning();
      insertedModules.set(m.code, inserted.id);
    }
  }

  // 3. Seed Role Permissions (54 rows)
  for (const [roleName, roleId] of insertedRoles.entries()) {
    for (const [moduleCode, moduleId] of insertedModules.entries()) {
      const flags = getPermissionFlags(roleName, moduleCode);
      const existing = await targetDb.query.rolePermissions.findFirst({
        where: and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.moduleId, moduleId)
        ),
      });

      if (!existing) {
        await targetDb.insert(rolePermissions).values({
          roleId,
          moduleId,
          ...flags,
        });
      }
    }
  }

  // 4. Seed Default Superadmin
  const adminRoleId = insertedRoles.get("Admin")!;
  const superadminNim = "1201220001";
  const existingAdmin = await targetDb.query.kaders.findFirst({
    where: eq(kaders.nim, superadminNim),
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await targetDb.insert(kaders).values({
      roleId: adminRoleId,
      nim: superadminNim,
      passwordHash,
      fullName: "Super Administrator",
      whatsappNumber: "081234567890",
      prodi: "S1 Sistem Informasi",
      fakultas: "Fakultas Rekayasa Industri",
      interestCategory: "Punya Bisnis",
      status: "Aktif",
      totalScore: 100,
    });
  }

  console.log("Database seeded successfully.");
}

import { seedCmsData } from "./cms.seed.js";

if (process.argv[1]?.endsWith("initial.seed.ts")) {
  seedDatabase()
    .then(() => seedCmsData())
    .then(() => closeDbConnection())
    .catch((err) => {
      console.error("Seeding error:", err);
      process.exit(1);
    });
}
