import { z } from "zod";

export const newsCategoryValues = [
  "Kegiatan",
  "Pengumuman",
  "Prestasi",
  "Bisnis",
] as const;

export const newsAudienceValues = ["INTERNAL", "PUBLIC", "BOTH"] as const;

export const createNewsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Judul berita minimal 5 karakter")
    .max(120, "Judul berita maksimal 120 karakter"),
  category: z.enum(newsCategoryValues).default("Kegiatan"),
  summary: z
    .string()
    .trim()
    .min(10, "Ringkasan berita minimal 10 karakter")
    .max(240, "Ringkasan berita maksimal 240 karakter"),
  content: z
    .string()
    .trim()
    .min(20, "Isi berita minimal 20 karakter")
    .max(15000, "Isi berita maksimal 15000 karakter"),
  imageSrc: z.string().trim().max(500).optional().nullable(),
  imageAlt: z.string().trim().max(140).optional().nullable(),
  targetAudience: z.enum(newsAudienceValues).default("BOTH"),
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
  publishedAt: z.string().optional(),
});

export const updateNewsSchema = createNewsSchema.partial();

export const reorderNewsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1, "Minimal 1 ID berita diperlukan"),
});

export const newsQuerySchema = z.object({
  category: z.enum(newsCategoryValues).optional(),
  targetAudience: z.enum(newsAudienceValues).optional(),
  isPublished: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type NewsQueryInput = z.infer<typeof newsQuerySchema>;
