import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";
import { passwordResetService } from "./password-reset.service.js";

type Variables = {
  user: AuthUser;
};

const decisionSchema = z.object({
  notes: z.string().trim().max(240).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const passwordResetRouter = new Hono<{ Variables: Variables }>();

passwordResetRouter.use("*", authMiddleware);

passwordResetRouter.get(
  "/pending-count",
  rbacMiddleware("password-reset", "read"),
  async (c) => {
    const pendingCount = await passwordResetService.getPendingCount();
    return c.json({
      success: true,
      data: { pendingCount },
    });
  }
);

passwordResetRouter.get(
  "/",
  rbacMiddleware("password-reset", "read"),
  async (c) => {
    const query = listQuerySchema.parse(c.req.query());
    const data = await passwordResetService.listRequests(query.status);
    return c.json({
      success: true,
      data,
    });
  }
);

passwordResetRouter.post(
  "/:id/approve",
  rbacMiddleware("password-reset", "approve"),
  zValidator("json", decisionSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const data = await passwordResetService.approveRequest(id, user.id, body.notes);
    return c.json({
      success: true,
      message: "Reset password disetujui; password kader kini disetel ke NIM",
      data,
    });
  }
);

passwordResetRouter.post(
  "/:id/reject",
  rbacMiddleware("password-reset", "approve"),
  zValidator("json", decisionSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const data = await passwordResetService.rejectRequest(id, user.id, body.notes);
    return c.json({
      success: true,
      message: "Pengajuan reset password ditolak",
      data,
    });
  }
);
