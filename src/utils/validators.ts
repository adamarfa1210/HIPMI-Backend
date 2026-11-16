import { z } from "zod";
import { sanitizePlainText, validateAntiSlop } from "./sanitize.js";

/**
 * Helper to build a sanitized plain text string schema with character limits and anti-slop check.
 */
export const plainTextSchema = (
  min: number,
  max: number,
  fieldName = "Field"
) =>
  z
    .string({ required_error: `${fieldName} wajib diisi` })
    .refine((val) => validateAntiSlop(val), {
      message: `${fieldName} tidak boleh mengandung pemisah dekoratif seperti • atau ●`,
    })
    .transform((val) => sanitizePlainText(val))
    .refine((val) => val.length >= min, {
      message: `${fieldName} minimal ${min} karakter`,
    })
    .refine((val) => val.length <= max, {
      message: `${fieldName} maksimal ${max} karakter (batas keras)`,
    });

/**
 * Optional plain text string schema.
 */
export const optionalPlainTextSchema = (
  min: number,
  max: number,
  fieldName = "Field"
) =>
  z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || validateAntiSlop(val), {
      message: `${fieldName} tidak boleh mengandung pemisah dekoratif seperti • atau ●`,
    })
    .transform((val) => (val ? sanitizePlainText(val) : val))
    .refine((val) => !val || val.length >= min, {
      message: `${fieldName} minimal ${min} karakter`,
    })
    .refine((val) => !val || val.length <= max, {
      message: `${fieldName} maksimal ${max} karakter (batas keras)`,
    });

// 1. Hero Slide Schema
export const heroSlideSchema = z.object({
  title: plainTextSchema(10, 45, "title"),
  subtitle: plainTextSchema(40, 180, "subtitle"),
  imageSrc: z.string().max(255, "imageSrc maksimal 255 karakter").url("URL gambar tidak valid"),
  imageAlt: plainTextSchema(10, 140, "imageAlt"),
  indexLabel: z.string().max(10, "indexLabel maksimal 10 karakter").optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  isPublished: z.boolean().optional().default(true),
  slotStatus: z.enum(["ready", "pending-asset"]).optional().default("ready"),
});

export const heroSlideUpdateSchema = heroSlideSchema.partial();

// 2. Tentang & 3 Pilar Schemas
export const pillarItemSchema = z.object({
  id: z.string().uuid().optional(),
  title: plainTextSchema(5, 32, "pillar.title"),
  description: plainTextSchema(30, 120, "pillar.description"),
  sortOrder: z.number().int().optional(),
});

export const tentangProfileSchema = z.object({
  eyebrow: plainTextSchema(3, 30, "eyebrow"),
  title: plainTextSchema(15, 70, "title"),
  description: plainTextSchema(60, 320, "description"),
  secondaryDescription: optionalPlainTextSchema(60, 280, "secondaryDescription"),
  videoPosterSrc: z.string().max(255).url().optional().nullable(),
  videoUrl: z.string().max(255).url().optional().nullable(),
  pillars: z
    .array(pillarItemSchema)
    .length(3, "Tentang harus memiliki tepat 3 pilar aktif")
    .optional(),
});

export const tentangPillarsReplaceSchema = z.object({
  pillars: z
    .array(pillarItemSchema)
    .length(3, "Tentang harus memiliki tepat 3 pilar aktif"),
});

// 3. Partnerships / Mitra Schema
export const partnerSchema = z.object({
  name: plainTextSchema(3, 35, "name"),
  category: z.enum(
    [
      "Korporasi & BUMN",
      "Asosiasi & HIPMI",
      "Dinas & Inkubator",
      "Komunitas & Media",
      "Mitra Strategis",
    ],
    { errorMap: () => ({ message: "kategori mitra tidak valid" }) }
  ),
  scope: plainTextSchema(30, 160, "scope"),
  period: plainTextSchema(4, 60, "period"),
  status: plainTextSchema(4, 30, "status"),
  imageAlt: plainTextSchema(10, 140, "imageAlt"),
  imageSrc: z.string().max(255).url().optional(),
  logoUrl: z.string().max(255).url().optional(),
  sortOrder: z.number().int().optional().default(0),
  isPublished: z.boolean().optional().default(true),
});

export const partnerUpdateSchema = partnerSchema.partial();

// 4. Bisnis Kader Schema
export const bisnisKaderSchema = z.object({
  kaderId: z.string().uuid().optional().nullable(),
  businessName: plainTextSchema(3, 45, "businessName"),
  sector: z.enum(
    ["Teknologi & Jasa", "Kuliner / F&B", "Kreatif & Media", "Fesyen & Ritel"],
    { errorMap: () => ({ message: "sektor bisnis tidak valid" }) }
  ),
  description: plainTextSchema(40, 180, "description"),
  ownerLabel: plainTextSchema(5, 45, "ownerLabel"),
  verifiedLabel: plainTextSchema(5, 40, "verifiedLabel"),
  imageAlt: optionalPlainTextSchema(10, 140, "imageAlt"),
  imageSrc: z.string().max(255).url().optional().nullable(),
  imageUrl: z.string().max(255).url().optional().nullable(),
  slotStatus: z.enum(["ready", "pending-asset"]).optional().default("ready"),
  sortOrder: z.number().int().optional().default(0),
  isPublished: z.boolean().optional().default(true),
});

export const bisnisKaderUpdateSchema = bisnisKaderSchema.partial();

// 5. Prestasi & Penghargaan Schema
export const prestasiSchema = z.object({
  title: plainTextSchema(8, 55, "title"),
  category: z.enum(
    ["Kompetisi Bisnis", "Pendanaan & Hibah", "Tingkat Nasional", "Rekognisi"],
    { errorMap: () => ({ message: "kategori prestasi tidak valid" }) }
  ),
  description: plainTextSchema(40, 180, "description"),
  recipientLabel: plainTextSchema(5, 50, "recipientLabel"),
  organizerLabel: plainTextSchema(5, 55, "organizerLabel"),
  imageAlt: optionalPlainTextSchema(10, 140, "imageAlt"),
  imageSrc: z.string().max(255).url().optional().nullable(),
  imageUrl: z.string().max(255).url().optional().nullable(),
  slotStatus: z.enum(["ready", "pending-asset"]).optional().default("ready"),
  sortOrder: z.number().int().optional().default(0),
  isPublished: z.boolean().optional().default(true),
});

export const prestasiUpdateSchema = prestasiSchema.partial();

// 6. Testimoni Schema
export const testimoniSchema = z.object({
  category: z.enum(["Kader & Alumni", "Mitra Kolaborasi"], {
    errorMap: () => ({ message: "kategori testimoni tidak valid" }),
  }),
  quote: plainTextSchema(60, 240, "quote"),
  authorLabel: plainTextSchema(3, 40, "authorLabel"),
  roleOrOrg: plainTextSchema(5, 55, "roleOrOrg"),
  verified: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
  isPublished: z.boolean().optional().default(true),
});

export const testimoniUpdateSchema = testimoniSchema.partial();

// 7. Program Kerja & Kompartemen Schemas
export const programBidangSchema = z.object({
  slug: z.enum(["okk", "medkominfo", "eksternal", "ekraf"], {
    errorMap: () => ({ message: "slug bidang tidak valid" }),
  }),
  shortName: plainTextSchema(3, 15, "shortName"),
  title: plainTextSchema(5, 25, "title"),
  eyebrow: plainTextSchema(10, 40, "eyebrow"),
  description: plainTextSchema(50, 240, "description"),
  compartmentSummary: plainTextSchema(5, 50, "compartmentSummary"),
  summaryStats: optionalPlainTextSchema(5, 60, "summaryStats"),
  sortOrder: z.number().int().optional().default(0),
});

export const programBidangUpdateSchema = programBidangSchema.partial();

export const compartmentSchema = z.object({
  bidangId: z.string().uuid().optional(),
  code: plainTextSchema(1, 35, "code"),
  name: plainTextSchema(1, 35, "name"),
  operationalPattern: z.enum(["proker-only", "jobdesk-only", "proker-jobdesk"]),
  sortOrder: z.number().int().optional().default(0),
});

export const compartmentUpdateSchema = compartmentSchema.partial();

export const programSlideSchema = z.object({
  compartmentId: z.string().uuid().optional(),
  kind: z.enum(["proker", "jobdesk"]),
  title: plainTextSchema(4, 45, "title"),
  description: plainTextSchema(40, 200, "description"),
  mediaSourceLabel: optionalPlainTextSchema(0, 50, "mediaSourceLabel"),
  imageAlt: optionalPlainTextSchema(10, 140, "imageAlt"),
  imageSrc: z.string().max(255).url().optional().nullable(),
  slotStatus: z.enum(["ready", "pending-asset"]).optional().default("ready"),
  sortOrder: z.number().int().optional().default(0),
});

export const programSlideUpdateSchema = programSlideSchema.partial();

// 8. Site Settings & Announcements Schemas
export const siteSettingsSchema = z.object({
  googleDocsTemplateUrl: z.string().max(255).url().optional().nullable(),
  scoreWeightMeeting: z.number().int().optional(),
  scoreWeightProker: z.number().int().optional(),
  ctaCollaborationHref: z.string().max(255).optional(),
  ctaBusinessHref: z.string().max(255).optional(),
  ctaAchievementHref: z.string().max(255).optional(),
  secretariatAddress: plainTextSchema(10, 150, "secretariatAddress"),
  officialEmail: z
    .string()
    .email("Format officialEmail tidak valid")
    .max(80, "officialEmail maksimal 80 karakter"),
  officialInstagram: optionalPlainTextSchema(1, 40, "officialInstagram"),
  whatsappContactLabel: optionalPlainTextSchema(1, 60, "whatsappContactLabel"),
  whatsappContactUrl: z.string().max(255).url().optional().nullable(),
  copyrightText: optionalPlainTextSchema(1, 80, "copyrightText"),
});

export const siteSettingsUpdateSchema = siteSettingsSchema.partial();

export const announcementSchema = z.object({
  title: plainTextSchema(5, 120, "title"),
  content: z.string().min(10, "content minimal 10 karakter").max(2000, "content maksimal 2000 karakter"),
  targetAudience: z.enum(["INTERNAL", "PUBLIC", "BOTH"]).default("BOTH"),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isActive: z.boolean().optional().default(true),
});

export const announcementUpdateSchema = announcementSchema.partial();
