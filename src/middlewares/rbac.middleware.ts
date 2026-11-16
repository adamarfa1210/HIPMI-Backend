import type { Context, Next } from "hono";
import { db } from "../db/index.js";
import { modules, rolePermissions } from "../db/schema/auth.js";
import { eq, and } from "drizzle-orm";
import type { AuthUser } from "./auth.middleware.js";

export type PermissionAction = "read" | "create" | "update" | "delete" | "approve";

export const rbacMiddleware = (moduleCode: string, action: PermissionAction) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as AuthUser | undefined;
    if (!user) {
      return c.json(
        {
          success: false,
          message: "Sesi tidak valid atau belum terautentikasi",
          error: {
            code: "UNAUTHORIZED",
            message: "Sesi tidak valid atau belum terautentikasi",
          },
        },
        401
      );
    }

    // 1. Superadmin Bypass: Admin role has absolute access across all modules
    if (user.roleName === "Admin" || user.roleCode === "admin") {
      return await next();
    }

    // 2. Module-First Verification: Module must exist in database
    const targetModule = await db.query.modules.findFirst({
      where: eq(modules.code, moduleCode),
    });

    if (!targetModule) {
      return c.json(
        {
          success: false,
          message: `Modul [${moduleCode}] tidak terdaftar di sistem`,
          error: {
            code: "FORBIDDEN",
            message: `Modul [${moduleCode}] tidak terdaftar di sistem`,
          },
        },
        403
      );
    }

    // 3. Role Permission Verification: Lookup role_id + module_id
    const permission = await db.query.rolePermissions.findFirst({
      where: and(
        eq(rolePermissions.roleId, user.roleId),
        eq(rolePermissions.moduleId, targetModule.id)
      ),
    });

    if (!permission) {
      return c.json(
        {
          success: false,
          message: `Akses ditolak: Tidak ada izin untuk modul [${moduleCode}]`,
          error: {
            code: "FORBIDDEN",
            message: `Akses ditolak: Tidak ada izin untuk modul [${moduleCode}]`,
          },
        },
        403
      );
    }

    // 4. Action Flag Verification
    const actionFlags: Record<PermissionAction, boolean> = {
      read: permission.canRead,
      create: permission.canCreate,
      update: permission.canUpdate,
      delete: permission.canDelete,
      approve: permission.canApprove,
    };

    if (!actionFlags[action]) {
      return c.json(
        {
          success: false,
          message: `Akses ditolak: Anda tidak memiliki izin [${action.toUpperCase()}] pada modul [${targetModule.label}]`,
          error: {
            code: "FORBIDDEN",
            message: `Akses ditolak: Anda tidak memiliki izin [${action.toUpperCase()}] pada modul [${targetModule.label}]`,
          },
        },
        403
      );
    }

    return await next();
  };
};
