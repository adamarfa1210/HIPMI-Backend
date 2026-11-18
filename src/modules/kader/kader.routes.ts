import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { kaderService } from "./kader.service.js";
import {
  createCadreSchema,
  updateCadreSchema,
  kaderFilterSchema,
  resetCadrePasswordSchema,
} from "./kader.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";
import { AppError } from "../../middlewares/error.middleware.js";

type Variables = {
  user: AuthUser;
};

export const kaderRouter = new Hono<{ Variables: Variables }>();

kaderRouter.use("*", authMiddleware);

// 1. GET /api/kaders/export (MUST be placed before /:id)
kaderRouter.get("/export", rbacMiddleware("kaders", "read"), async (c) => {
  const query = c.req.query();
  const format = (query.format === "csv" ? "csv" : "xlsx") as "xlsx" | "csv";
  const validatedQuery = kaderFilterSchema.parse(query);

  const { buffer, mimeType, fileName } = await kaderService.exportKaders(
    validatedQuery,
    format
  );

  return c.body(new Uint8Array(buffer), 200, {
    "Content-Type": mimeType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
  });
});

// 2. POST /api/kaders/import (MUST be placed before /:id)
kaderRouter.post("/import", rbacMiddleware("kaders", "create"), async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const uploadedFile = body.file;

  if (!uploadedFile) {
    throw new AppError(400, "BAD_REQUEST", "File upload is required");
  }

  let buffer: Buffer;
  if (uploadedFile && typeof uploadedFile === "object" && "arrayBuffer" in uploadedFile) {
    const arrayBuffer = await (uploadedFile as any).arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (Buffer.isBuffer(uploadedFile)) {
    buffer = uploadedFile;
  } else {
    throw new AppError(400, "BAD_REQUEST", "Invalid file payload");
  }

  const roleId =
    typeof body.roleId === "string" && body.roleId.trim().length > 0
      ? body.roleId.trim()
      : undefined;

  const result = await kaderService.importKaders(buffer, user!.id, roleId);
  return c.json({
    success: true,
    data: result,
  });
});

// 2b. GET /api/kaders/roles (MUST be placed before /:id)
kaderRouter.get("/roles", rbacMiddleware("kaders", "read"), async (c) => {
  const data = await kaderService.listRoles();
  return c.json({
    success: true,
    data,
  });
});

// 3. GET /api/kaders
kaderRouter.get("/", rbacMiddleware("kaders", "read"), async (c) => {
  const query = c.req.query();
  const validated = kaderFilterSchema.parse(query);
  const result = await kaderService.listKaders(validated);

  return c.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
});

// 4. POST /api/kaders
kaderRouter.post(
  "/",
  rbacMiddleware("kaders", "create"),
  zValidator("json", createCadreSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await kaderService.createCadre(body, user!.id);

    return c.json(
      {
        success: true,
        message: "Kader berhasil ditambahkan",
        data: result,
      },
      201
    );
  }
);

// 5. GET /api/kaders/:id
kaderRouter.get("/:id", rbacMiddleware("kaders", "read"), async (c) => {
  const id = c.req.param("id")!;
  const result = await kaderService.getKaderById(id);

  return c.json({
    success: true,
    data: result,
  });
});

// 6. PATCH /api/kaders/:id
kaderRouter.patch(
  "/:id",
  rbacMiddleware("kaders", "update"),
  zValidator("json", updateCadreSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await kaderService.updateCadre(id, body, user!.id);

    return c.json({
      success: true,
      message: "Data kader berhasil diperbarui",
      data: result,
    });
  }
);

// 7. DELETE /api/kaders/:id
kaderRouter.delete("/:id", rbacMiddleware("kaders", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const user = c.get("user");
  const result = await kaderService.softDeleteCadre(id, user!.id);

  return c.json(result);
});

// 8. POST /api/kaders/:id/reset-password (PRD 3.1 Admin/BPH Reset Password)
kaderRouter.post(
  "/:id/reset-password",
  rbacMiddleware("kaders", "update"),
  zValidator("json", resetCadrePasswordSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await kaderService.resetCadrePassword(
      id,
      body.newPassword,
      user!.id
    );

    return c.json({
      success: true,
      message: data.resetToNim
        ? "Password kader berhasil direset ke NIM"
        : "Password kader berhasil diperbarui",
      data,
    });
  }
);
