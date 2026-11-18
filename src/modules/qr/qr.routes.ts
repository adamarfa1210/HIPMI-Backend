import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { qrService } from "./qr.service.js";
import { scanQrSchema } from "./qr.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacAnyMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const qrRouter = new Hono<{ Variables: Variables }>();

qrRouter.use("*", authMiddleware);

qrRouter.post(
  "/scan",
  rbacAnyMiddleware([
    { moduleCode: "qr-scanner", action: "read" },
    { moduleCode: "qr-scanner", action: "create" },
  ]),
  zValidator("json", scanQrSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await qrService.processScan(body.payload, user);

    return c.json({
      success: true,
      message: result.message,
      data: result,
    });
  }
);
