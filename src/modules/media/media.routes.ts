import { Hono } from "hono";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { MediaService } from "../../services/media.service.js";

export const mediaRouter = new Hono();
mediaRouter.use("*", authMiddleware);

mediaRouter.post("/upload", rbacMiddleware("cms", "create"), async (c) => {
  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new AppError(400, "BAD_REQUEST", "Content-Type harus multipart/form-data");
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const slot = (formData.get("slot") as string) || "hero-home";
  const imageAlt = (formData.get("imageAlt") as string) || undefined;

  if (!file) {
    throw new AppError(400, "BAD_REQUEST", "File gambar tidak ditemukan");
  }

  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const result = await MediaService.processImage({
    buffer,
    contentType: file.type,
    slot,
    filename: file.name,
    imageAlt,
  });

  return c.json({ success: true, message: "Media berhasil diproses dan diunggah", data: result }, 201);
});
