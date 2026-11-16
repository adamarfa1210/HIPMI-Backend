import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { rbacService } from "./rbac.service.js";
import { updateMatrixSchema } from "./rbac.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const rbacRouter = new Hono<{ Variables: Variables }>();

rbacRouter.use("*", authMiddleware);

// 1. GET /api/admin/rbac/matrix
rbacRouter.get("/matrix", rbacMiddleware("admin-rbac", "read"), async (c) => {
  const result = await rbacService.getMatrix();
  return c.json({
    success: true,
    data: result,
  });
});

// 2. PUT /api/admin/rbac/matrix/:roleId
rbacRouter.put(
  "/matrix/:roleId",
  rbacMiddleware("admin-rbac", "update"),
  zValidator("json", updateMatrixSchema),
  async (c) => {
    const roleId = c.req.param("roleId");
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await rbacService.updateMatrix(roleId, body, user.id);
    return c.json({
      success: true,
      message: "Hak akses berhasil diperbarui",
      data: result,
    });
  }
);
