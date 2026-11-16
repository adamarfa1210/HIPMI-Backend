import { Hono } from "hono";
import { documentsService } from "./documents.service.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const documentsRouter = new Hono<{ Variables: Variables }>();

documentsRouter.use("*", authMiddleware);

// 1. GET /api/documents/templates
documentsRouter.get("/templates", rbacMiddleware("documents", "read"), async (c) => {
  const data = await documentsService.getTemplates();
  return c.json({
    success: true,
    message: "Template surat resmi berhasil dimuat",
    data,
  });
});

// 2. GET /api/documents
documentsRouter.get("/", rbacMiddleware("documents", "read"), async (c) => {
  const data = await documentsService.getDocuments();
  return c.json({
    success: true,
    message: "Daftar repositori dokumen berhasil dimuat",
    data,
  });
});
