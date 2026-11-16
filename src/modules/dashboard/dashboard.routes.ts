import { Hono } from "hono";
import { dashboardService } from "./dashboard.service.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const dashboardRouter = new Hono<{ Variables: Variables }>();

dashboardRouter.use("*", authMiddleware);

dashboardRouter.get("/summary", rbacMiddleware("dashboard", "read"), async (c) => {
  const data = await dashboardService.getSummary();

  return c.json({
    success: true,
    message: "Dashboard summary berhasil dimuat",
    data,
  });
});
