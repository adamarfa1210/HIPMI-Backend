import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { kaderRouter } from "./modules/kader/kader.routes.js";
import { rbacRouter } from "./modules/rbac/rbac.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { financeRouter } from "./modules/finance/finance.routes.js";
import { trackingRouter } from "./modules/tracking/tracking.routes.js";
import { leaderboardRouter } from "./modules/leaderboard/leaderboard.routes.js";
import { calendarRouter, publicCalendarRouter } from "./modules/calendar/calendar.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { cmsRouter } from "./modules/cms/cms.routes.js";
import { publicRouter } from "./modules/public/public.routes.js";
import { mediaRouter } from "./modules/media/media.routes.js";
import type { AuthUser } from "./middlewares/auth.middleware.js";

export interface AppContext {
  Variables: {
    user: AuthUser;
  };
}

export const app = new Hono<AppContext>();

// Global Middlewares
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        process.env.ERP_FRONTEND_URL?.replace(/\/$/, ""),
        process.env.PUBLIC_WEB_URL?.replace(/\/$/, ""),
        "https://hipmi-pt-telkom-erp.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
      ].filter(Boolean) as string[];
      return !origin || allowed.includes(origin) ? origin : allowed[0];
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-revalidate-secret"],
    credentials: true,
  })
);

// Global Error Handlers
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Root banner & Health check
app.get("/", (c) =>
  c.json({
    success: true,
    service: "hipmi-pt-telkom-api",
    status: "ok",
    endpoints: {
      health: "/health",
      publicHome: "/api/public/home",
    },
  })
);

// Health check
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "hipmi-pt-telkom-api",
    timestamp: new Date().toISOString(),
  })
);

// Serve uploaded media in local storage mode safely
app.get("/uploads/*", async (c) => {
  const relPath = c.req.path.replace(/^\/uploads\/?/, "");
  const baseDir = path.resolve(
    process.env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), "uploads")
  );
  const fullPath = path.resolve(baseDir, relPath);
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    return c.json({ success: false, message: "Forbidden" }, 403);
  }
  try {
    const fileBuf = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    };
    return new Response(fileBuf, {
      status: 200,
      headers: {
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return c.json({ success: false, message: "Media tidak ditemukan" }, 404);
  }
});

// Route Mounting
app.route("/api/auth", authRouter);
app.route("/api/kaders", kaderRouter);
app.route("/api/admin/rbac", rbacRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/finance", financeRouter);
app.route("/api/tracking", trackingRouter);
app.route("/api/leaderboard", leaderboardRouter);
app.route("/api/calendar", calendarRouter);
app.route("/api/public/calendar", publicCalendarRouter);
app.route("/api/documents", documentsRouter);
app.route("/api/cms", cmsRouter);
app.route("/api/media", mediaRouter);
app.route("/api/public", publicRouter);

export default app;
