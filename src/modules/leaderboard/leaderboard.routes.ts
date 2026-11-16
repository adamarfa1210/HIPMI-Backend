import { Hono } from "hono";
import { leaderboardService } from "./leaderboard.service.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const leaderboardRouter = new Hono<{ Variables: Variables }>();

leaderboardRouter.use("*", authMiddleware);

// 1. GET /api/leaderboard
leaderboardRouter.get("/", rbacMiddleware("leaderboard", "read"), async (c) => {
  const user = c.get("user");
  const query = c.req.query();
  const page = query.page ? parseInt(query.page, 10) : 1;
  const limit = query.limit ? parseInt(query.limit, 10) : 50;

  const result = await leaderboardService.getLeaderboard(page, limit, user.id);

  return c.json({
    success: true,
    message: "Leaderboard kader berhasil diambil",
    data: {
      leaderboard: result.leaderboard,
      currentUserRank: result.currentUserRank,
    },
    meta: result.meta,
  });
});

// 2. GET /api/leaderboard/kaders/:id/ledger
leaderboardRouter.get(
  "/kaders/:id/ledger",
  rbacMiddleware("leaderboard", "read"),
  async (c) => {
    const kaderId = c.req.param("id")!;
    const data = await leaderboardService.getCadreLedger(kaderId);

    return c.json({
      success: true,
      message: "Riwayat audit poin kader berhasil diambil",
      data,
    });
  }
);
