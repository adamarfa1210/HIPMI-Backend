import { z } from "zod";

export const createCadreSchema = z.object({
  roleId: z.string().uuid("Role ID harus berupa UUID"),
  nim: z.string().min(5, "NIM minimal 5 karakter").max(20, "NIM maksimal 20 karakter"),
  password: z.string().min(6, "Password minimal 6 karakter").optional(),
  fullName: z.string().min(3, "Nama lengkap minimal 3 karakter").max(120),
  whatsappNumber: z.string().min(8, "Nomor WhatsApp minimal 8 karakter").max(20),
  prodi: z.string().min(2, "Prodi minimal 2 karakter").max(80),
  fakultas: z.string().min(2, "Fakultas minimal 2 karakter").max(80),
  instagram: z.string().max(60).optional(),
  businessName: z.string().max(120).optional(),
  interestCategory: z.enum([
    "Kompetisi",
    "Punya Bisnis",
    "Belum Punya Bisnis",
    "Belum Punya Bisnis tapi Minat Kompetisi",
  ]),
  status: z.enum(["Aktif", "Non-Aktif", "Alumni"]).default("Aktif"),
});

export type CreateCadreInput = z.infer<typeof createCadreSchema>;

export const updateCadreSchema = z.object({
  roleId: z.string().uuid().optional(),
  nim: z.string().min(5).max(20).optional(),
  fullName: z.string().min(3).max(120).optional(),
  whatsappNumber: z.string().min(8).max(20).optional(),
  prodi: z.string().min(2).max(80).optional(),
  fakultas: z.string().min(2).max(80).optional(),
  instagram: z.string().max(60).optional(),
  businessName: z.string().max(120).optional(),
  interestCategory: z
    .enum([
      "Kompetisi",
      "Punya Bisnis",
      "Belum Punya Bisnis",
      "Belum Punya Bisnis tapi Minat Kompetisi",
    ])
    .optional(),
  status: z.enum(["Aktif", "Non-Aktif", "Alumni"]).optional(),
  totalScore: z.number().int().optional(),
});

export type UpdateCadreInput = z.infer<typeof updateCadreSchema>;

export const kaderFilterSchema = z.object({
  search: z.string().optional(),
  prodi: z.string().optional(),
  fakultas: z.string().optional(),
  interest: z.string().optional(),
  status: z.string().optional(),
  roleId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["fullName", "nim", "totalScore", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  format: z.enum(["xlsx", "csv"]).optional(),
});

export type KaderFilterInput = z.infer<typeof kaderFilterSchema>;
