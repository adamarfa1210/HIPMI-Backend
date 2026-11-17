import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { financeService } from "./finance.service.js";
import {
  createTransactionSchema,
  approveTransactionSchema,
  financeQuerySchema,
} from "./finance.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const financeRouter = new Hono<{ Variables: Variables }>();

// All finance routes require authenticated session
financeRouter.use("*", authMiddleware);

// ============================================================================
// MODUL 1: PENGAJUAN KEUANGAN (finance-request)
// ============================================================================

// A1. GET /api/finance/submissions (scoped to requester's own submissions)
financeRouter.get(
  "/submissions",
  rbacMiddleware("finance-request", "read"),
  async (c) => {
    const user = c.get("user");
    const query = financeQuerySchema.parse(c.req.query());
    const result = await financeService.getTransactions(query, user.id);

    return c.json({
      success: true,
      message: "Daftar pengajuan transaksi Anda berhasil dimuat",
      data: result.transactions,
      meta: result.meta,
    });
  }
);

// A2. POST /api/finance/submissions
financeRouter.post(
  "/submissions",
  rbacMiddleware("finance-request", "create"),
  zValidator("json", createTransactionSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const created = await financeService.createTransaction(body, user.id);
    return c.json(
      {
        success: true,
        message: "Pengajuan transaksi berhasil dikirim dan menunggu persetujuan",
        data: created,
      },
      201
    );
  }
);

// A3. GET /api/finance/submissions/:id/receipt (own approved submission receipt)
financeRouter.get(
  "/submissions/:id/receipt",
  rbacMiddleware("finance-request", "read"),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const pdfBuffer = await financeService.getTransactionReceipt(id, user.id);

    return c.body(new Uint8Array(pdfBuffer), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${id}.pdf"`,
    });
  }
);

// ============================================================================
// MODUL 2: PERSETUJUAN & KAS KEUANGAN (finance)
// ============================================================================

// 1. GET /api/finance/summary
financeRouter.get("/summary", rbacMiddleware("finance", "read"), async (c) => {
  const query = c.req.query();
  const year = query.year ? parseInt(query.year, 10) : undefined;
  const month = query.month ? parseInt(query.month, 10) : undefined;

  const data = await financeService.getSummary(year, month);
  return c.json({
    success: true,
    message: "Ringkasan keuangan berhasil dimuat",
    data,
  });
});

// 2. GET /api/finance/export (MUST be registered before parameterized routes)
financeRouter.get("/export", rbacMiddleware("finance", "read"), async (c) => {
  const query = financeQuerySchema.parse(c.req.query());
  const format = query.format === "pdf" ? "pdf" : "xlsx";

  const { buffer, mimeType, fileName } =
    await financeService.exportTransactions(query, format);

  return c.body(new Uint8Array(buffer), 200, {
    "Content-Type": mimeType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
  });
});

// 3. GET /api/finance/transactions
financeRouter.get("/transactions", rbacMiddleware("finance", "read"), async (c) => {
  const query = financeQuerySchema.parse(c.req.query());
  const result = await financeService.getTransactions(query);

  return c.json({
    success: true,
    message: "Daftar transaksi berhasil dimuat",
    data: result.transactions,
    meta: result.meta,
  });
});

// 4. POST /api/finance/transactions
financeRouter.post(
  "/transactions",
  rbacMiddleware("finance", "create"),
  zValidator("json", createTransactionSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const created = await financeService.createTransaction(body, user.id);
    return c.json(
      {
        success: true,
        message: "Transaksi berhasil dicatat dan menunggu persetujuan",
        data: created,
      },
      201
    );
  }
);

// 5. PATCH /api/finance/transactions/:id/approve
financeRouter.patch(
  "/transactions/:id/approve",
  rbacMiddleware("finance", "approve"),
  zValidator("json", approveTransactionSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const updated = await financeService.approveTransaction(id, body, user.id);
    const action = body.status === "APPROVED" ? "disetujui" : "ditolak";
    return c.json({
      success: true,
      message: `Transaksi berhasil ${action}`,
      data: updated,
    });
  }
);

// 6. GET /api/finance/transactions/:id/receipt
financeRouter.get(
  "/transactions/:id/receipt",
  rbacMiddleware("finance", "read"),
  async (c) => {
    const id = c.req.param("id")!;
    const pdfBuffer = await financeService.getTransactionReceipt(id);

    return c.body(new Uint8Array(pdfBuffer), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${id}.pdf"`,
    });
  }
);
