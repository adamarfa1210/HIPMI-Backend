import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authService } from "./auth.service.js";
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  completeOnboardingSchema,
  updateProfileSchema,
} from "./auth.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

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

// 4. POST /api/auth/forgot-password (Public request queued for Admin ACC)
authRouter.post("/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await authService.requestForgotPassword(body);
  return c.json(
    {
      success: true,
      message: result.message,
      data: result.data,
    },
    201
  );
});

// 5. POST /api/auth/complete-onboarding (Complete profile & change default password != NIM)
authRouter.post(
  "/complete-onboarding",
  authMiddleware,
  zValidator("json", completeOnboardingSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await authService.completeOnboarding(user.id, body);
    return c.json({
      success: true,
      message: "Akun berhasil dilengkapi dan password baru disimpan",
      data: result,
    });
  }
);

// 6. GET & PATCH /api/auth/profile (Self-service Settings Profile module `profile`)
authRouter.get(
  "/profile",
  authMiddleware,
  rbacMiddleware("profile", "read"),
  async (c) => {
    const user = c.get("user");
    const result = await authService.getMe(user.id);
    return c.json({
      success: true,
      data: result,
    });
  }
);

authRouter.patch(
  "/profile",
  authMiddleware,
  rbacMiddleware("profile", "update"),
  zValidator("json", updateProfileSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await authService.updateOwnProfile(user.id, body);
    return c.json({
      success: true,
      message: "Profil pribadi berhasil diperbarui",
      data: result,
    });
  }
);
