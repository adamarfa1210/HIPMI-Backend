import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { newsService } from "./news.service.js";
import {
  createNewsSchema,
  newsQuerySchema,
  reorderNewsSchema,
  updateNewsSchema,
} from "./news.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const publicNewsRouter = new Hono();
export const newsRouter = new Hono<{ Variables: Variables }>();

// ============================================================================
// PUBLIC UKM WEB PROFILE ENDPOINTS (PUBLIC + BOTH)
// ============================================================================

publicNewsRouter.get("/", async (c) => {
  const query = newsQuerySchema.parse(c.req.query());
  const data = await newsService.getPublicNews(query.category);
  return c.json({
    success: true,
    message: "Berita publik HIPMI berhasil dimuat",
    data,
  });
});

publicNewsRouter.get("/:id", async (c) => {
  const id = c.req.param("id")!;
  const data = await newsService.getPublicNewsById(id);
  return c.json({
    success: true,
    message: "Detail berita publik berhasil dimuat",
    data,
  });
});

// ============================================================================
// INTERNAL ERP ENDPOINTS (MODUL KONSUMSI `news` + MODUL SETTING `news-manage`)
// ============================================================================

newsRouter.use("*", authMiddleware);

// Setting Berita routes MUST come before parameterized `/:id`
newsRouter.get("/manage", rbacMiddleware("news-manage", "read"), async (c) => {
  const query = newsQuerySchema.parse(c.req.query());
  const data = await newsService.listManageNews(query);
  return c.json({
    success: true,
    message: "Daftar manajemen berita berhasil dimuat",
    data,
  });
});

newsRouter.post(
  "/manage",
  rbacMiddleware("news-manage", "create"),
  zValidator("json", createNewsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const created = await newsService.createNews(body, user.id);
    return c.json(
      {
        success: true,
        message: "Berita berhasil dibuat",
        data: created,
      },
      201
    );
  }
);

newsRouter.patch(
  "/manage/reorder",
  rbacMiddleware("news-manage", "update"),
  zValidator("json", reorderNewsSchema),
  async (c) => {
    const body = c.req.valid("json");
    const result = await newsService.reorderNews(body.orderedIds);
    return c.json({
      success: true,
      message: "Urutan prioritas berita berhasil diperbarui",
      data: result,
    });
  }
);

newsRouter.patch(
  "/manage/:id",
  rbacMiddleware("news-manage", "update"),
  zValidator("json", updateNewsSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const updated = await newsService.updateNews(id, body);
    return c.json({
      success: true,
      message: "Berita berhasil diperbarui",
      data: updated,
    });
  }
);

newsRouter.delete(
  "/manage/:id",
  rbacMiddleware("news-manage", "delete"),
  async (c) => {
    const id = c.req.param("id")!;
    const data = await newsService.deleteNews(id);
    return c.json({
      success: true,
      message: "Berita berhasil dihapus",
      data,
    });
  }
);

// Consumption routes (`news:read`) for INTERNAL + BOTH
newsRouter.get("/", rbacMiddleware("news", "read"), async (c) => {
  const query = newsQuerySchema.parse(c.req.query());
  const data = await newsService.getInternalNews(query.category);
  return c.json({
    success: true,
    message: "Berita internal HIPMI berhasil dimuat",
    data,
  });
});

newsRouter.get("/:id", rbacMiddleware("news", "read"), async (c) => {
  const id = c.req.param("id")!;
  const data = await newsService.getInternalNewsById(id);
  return c.json({
    success: true,
    message: "Detail berita internal berhasil dimuat",
    data,
  });
});
