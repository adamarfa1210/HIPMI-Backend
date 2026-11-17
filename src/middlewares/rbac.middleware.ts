import type { Context, Next } from "hono";
import { db } from "../db/index.js";
import { modules, rolePermissions } from "../db/schema/auth.js";
import { eq, and } from "drizzle-orm";
import type { AuthUser } from "./auth.middleware.js";

export type PermissionAction = "read" | "create" | "update" | "delete" | "approve";

export interface PermissionRequirement {
  moduleCode: string;
  action: PermissionAction;
}

const ACTION_COLUMN_MAP: Record<
  PermissionAction,
  "canRead" | "canCreate" | "canUpdate" | "canDelete" | "canApprove"
> = {
  read: "canRead",
  create: "canCreate",
  update: "canUpdate",
  delete: "canDelete",
  approve: "canApprove",
};

function isSuperadmin(user: AuthUser): boolean {
  return user.roleName === "Admin" || user.roleCode === "admin";
}

function unauthorizedResponse(c: Context) {
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

function forbiddenResponse(c: Context, message: string) {
  return c.json(
    {
      success: false,
      message,
      error: {
        code: "FORBIDDEN",
        message,
      },
    },
    403
  );
}

async function checkPermission(
  user: AuthUser,
  moduleCode: string,
  action: PermissionAction
): Promise<{ allowed: boolean; reason?: string }> {
  const targetModule = await db.query.modules.findFirst({
    where: eq(modules.code, moduleCode),
  });

  if (!targetModule) {
    return { allowed: false, reason: `Modul [${moduleCode}] tidak terdaftar di sistem` };
  }

  const permission = await db.query.rolePermissions.findFirst({
    where: and(
      eq(rolePermissions.roleId, user.roleId),
      eq(rolePermissions.moduleId, targetModule.id)
    ),
  });

  if (!permission) {
    return {
      allowed: false,
      reason: `Akses ditolak: Tidak ada izin untuk modul [${moduleCode}]`,
    };
  }

  if (!permission[ACTION_COLUMN_MAP[action]]) {
    return {
      allowed: false,
      reason: `Akses ditolak: Anda tidak memiliki izin [${action.toUpperCase()}] pada modul [${targetModule.label}]`,
    };
  }

  return { allowed: true };
}

export const rbacMiddleware = (moduleCode: string, action: PermissionAction) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as AuthUser | undefined;
    if (!user) return unauthorizedResponse(c);
    if (isSuperadmin(user)) return await next();

    const check = await checkPermission(user, moduleCode, action);
    if (!check.allowed) {
      return forbiddenResponse(c, check.reason || "Akses ditolak");
    }

    return await next();
  };
};

export const rbacAnyMiddleware = (requirements: PermissionRequirement[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as AuthUser | undefined;
    if (!user) return unauthorizedResponse(c);
    if (isSuperadmin(user)) return await next();

    for (const req of requirements) {
      const check = await checkPermission(user, req.moduleCode, req.action);
      if (check.allowed) return await next();
    }

    const labels = requirements.map((r) => `${r.moduleCode}:${r.action}`).join(" / ");
    return forbiddenResponse(
      c,
      `Akses ditolak: Memerlukan salah satu izin [${labels}]`
    );
  };
};
