import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authService } from "./auth.service.js";
import { loginSchema, changePasswordSchema } from "./auth.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";

type Variables = {
  user: AuthUser;
};

export const authRouter = new Hono<{ Variables: Variables }>();

// 1. POST /api/auth/login
authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await authService.login(body);
  return c.json({
    success: true,
    data: result,
  });
});

// 2. GET /api/auth/me
authRouter.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const result = await authService.getMe(user.id);
  return c.json({
    success: true,
    data: result,
  });
});

// 3. PATCH /api/auth/change-password
authRouter.patch("/change-password", authMiddleware, zValidator("json", changePasswordSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const result = await authService.changePassword(user.id, body);
  return c.json({
    success: true,
    message: result.message,
  });
});
