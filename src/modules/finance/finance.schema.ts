import { z } from "zod";

export const createTransactionSchema = z.object({
  type: z.enum(["CASH_IN", "CASH_OUT"], {
    errorMap: () => ({ message: "Tipe transaksi harus CASH_IN atau CASH_OUT" }),
  }),
  fromEntity: z
    .string()
    .min(2, "Pihak pengirim minimal 2 karakter")
    .max(120, "Pihak pengirim maksimal 120 karakter"),
  toEntity: z
    .string()
    .min(2, "Pihak penerima minimal 2 karakter")
    .max(120, "Pihak penerima maksimal 120 karakter"),
  amount: z
    .number({ invalid_type_error: "Nominal harus berupa angka" })
    .positive("Nominal harus lebih besar dari 0"),
  description: z.string().min(3, "Deskripsi minimal 3 karakter"),
  transactionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
});

export const approveTransactionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "Status harus APPROVED atau REJECTED" }),
  }),
  rejectionReason: z.string().optional(),
});

export const financeQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["CASH_IN", "CASH_OUT"]).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  format: z.enum(["xlsx", "pdf"]).optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ApproveTransactionInput = z.infer<typeof approveTransactionSchema>;
export type FinanceQueryInput = z.infer<typeof financeQuerySchema>;
