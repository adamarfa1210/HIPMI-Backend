import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { roles, modules, rolePermissions, auditLogs } from "../../db/schema/auth.js";
import { AppError } from "../../middlewares/error.middleware.js";
import type { UpdateMatrixInput } from "./rbac.schema.js";

export class RbacService {
  async getMatrix() {
    const allRoles = await db.select().from(roles);
    const allModules = await db.select().from(modules);
    const allPermissions = await db
      .select({
        id: rolePermissions.id,
        roleId: rolePermissions.roleId,
        moduleId: rolePermissions.moduleId,
        canRead: rolePermissions.canRead,
        canCreate: rolePermissions.canCreate,
        canUpdate: rolePermissions.canUpdate,
        canDelete: rolePermissions.canDelete,
        canApprove: rolePermissions.canApprove,
        roleName: roles.name,
        moduleCode: modules.code,
        moduleLabel: modules.label,
      })
      .from(rolePermissions)
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .innerJoin(modules, eq(rolePermissions.moduleId, modules.id));

    return {
      roles: allRoles,
      modules: allModules,
      matrix: allPermissions,
    };
  }

  async updateMatrix(roleId: string, input: UpdateMatrixInput, actorKaderId: string) {
    const targetRole = await db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });

    if (!targetRole) {
      throw new AppError(404, "NOT_FOUND", "Role tidak ditemukan");
    }

    // Self-preservation guardrail: Cannot revoke settings or admin-rbac permissions from Admin
    if (targetRole.name === "Admin") {
      const configModules = await db
        .select({ id: modules.id, code: modules.code })
        .from(modules)
        .where(inArray(modules.code, ["admin-rbac", "settings"]));

      const configMap = new Map(configModules.map((m) => [m.id, m.code]));

      for (const p of input.permissions) {
        if (configMap.has(p.moduleId)) {
          if (p.canRead === false) {
            throw new AppError(
              400,
              "BAD_REQUEST",
              "Izin modul administrasi untuk role Admin tidak dapat dicabut demi mencegah penguncian sistem (lockout)"
            );
          }
        }
      }
    }

    const updatedPermissions = [];

    for (const perm of input.permissions) {
      const existing = await db.query.rolePermissions.findFirst({
        where: and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.moduleId, perm.moduleId)
        ),
      });

      if (existing) {
        const [updated] = await db
          .update(rolePermissions)
          .set({
            canRead: perm.canRead,
            canCreate: perm.canCreate,
            canUpdate: perm.canUpdate,
            canDelete: perm.canDelete,
            canApprove: perm.canApprove,
          })
          .where(eq(rolePermissions.id, existing.id))
          .returning();
        updatedPermissions.push(updated);
      } else {
        const [inserted] = await db
          .insert(rolePermissions)
          .values({
            roleId,
            moduleId: perm.moduleId,
            canRead: perm.canRead,
            canCreate: perm.canCreate,
            canUpdate: perm.canUpdate,
            canDelete: perm.canDelete,
            canApprove: perm.canApprove,
          })
          .returning();
        updatedPermissions.push(inserted);
      }
    }

    // Audit log
    await db.insert(auditLogs).values({
      actorKaderId,
      action: "UPDATE_RBAC_MATRIX",
      entityName: "roles",
      entityId: roleId,
      metadata: {
        roleId,
        updatedPermissionsCount: updatedPermissions.length,
      },
    });

    return updatedPermissions;
  }
}

export const rbacService = new RbacService();
