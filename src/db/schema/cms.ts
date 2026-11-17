import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { kaders } from "./auth.js";

// --- CMS Enums ---

export const partnerCategoryEnum = pgEnum("partner_category", [
  "Korporasi & BUMN",
  "Asosiasi & HIPMI",
  "Dinas & Inkubator",
  "Komunitas & Media",
  "Mitra Strategis",
]);

export const businessSectorEnum = pgEnum("business_sector", [
  "Teknologi & Jasa",
  "Kuliner / F&B",
  "Kreatif & Media",
  "Fesyen & Ritel",
]);

export const slotStatusEnum = pgEnum("slot_status", [
  "ready",
  "pending-asset",
]);

export const achievementCategoryEnum = pgEnum("achievement_category", [
  "Kompetisi Bisnis",
  "Pendanaan & Hibah",
  "Tingkat Nasional",
  "Rekognisi",
]);

export const bidangSlugEnum = pgEnum("bidang_slug", [
  "okk",
  "medkominfo",
  "eksternal",
  "ekraf",
]);

export const operationalPatternEnum = pgEnum("operational_pattern", [
  "proker-only",
  "jobdesk-only",
  "proker-jobdesk",
]);

export const programKindEnum = pgEnum("program_kind", [
  "proker",
  "jobdesk",
]);

export const testimonialCategoryEnum = pgEnum("testimonial_category", [
  "Kader & Alumni",
  "Mitra Kolaborasi",
]);

export const announcementAudienceEnum = pgEnum("announcement_audience", [
  "INTERNAL",
  "PUBLIC",
  "BOTH",
]);

export const newsCategoryEnum = pgEnum("news_category", [
  "Kegiatan",
  "Pengumuman",
  "Prestasi",
  "Bisnis",
]);

// --- 1. Hero Slides ---

export const heroSlides = pgTable("hero_slides", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 45 }).notNull(),
  subtitle: varchar("subtitle", { length: 180 }).notNull(),
  imageSrc: text("image_src"),
  imageAlt: varchar("image_alt", { length: 140 }),
  indexLabel: varchar("index_label", { length: 10 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 2. Tentang & 3 Pilar ---

export const tentangProfile = pgTable("tentang_profile", {
  id: integer("id").primaryKey().default(1), // Singleton id = 1
  eyebrow: varchar("eyebrow", { length: 30 }).notNull().default("TENTANG HIPMI PT"),
  title: varchar("title", { length: 70 }).notNull(),
  description: varchar("description", { length: 320 }).notNull(),
  secondaryDescription: varchar("secondary_description", { length: 280 }),
  videoPosterSrc: text("video_poster_src"),
  videoUrl: text("video_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tentangPillars = pgTable("tentang_pillars", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 32 }).notNull(),
  description: varchar("description", { length: 120 }).notNull(),
  sortOrder: integer("sort_order").notNull(), // 1, 2, or 3
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 3. Partnerships / Mitra ---

export const partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 35 }).notNull(),
  category: partnerCategoryEnum("category").notNull(),
  scope: varchar("scope", { length: 160 }).notNull(),
  period: varchar("period", { length: 60 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  imageSrc: text("image_src"),
  imageAlt: varchar("image_alt", { length: 140 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 4. Bisnis Kader ---

export const kaderBusinesses = pgTable("kader_businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  kaderId: uuid("kader_id").references(() => kaders.id, { onDelete: "set null" }),
  businessName: varchar("business_name", { length: 45 }).notNull(),
  sector: businessSectorEnum("sector").notNull().default("Teknologi & Jasa"),
  description: varchar("description", { length: 180 }).notNull(),
  ownerLabel: varchar("owner_label", { length: 45 }).notNull().default(""),
  ownerName: varchar("owner_name", { length: 60 }),
  verifiedLabel: varchar("verified_label", { length: 40 }).notNull().default("Terverifikasi"),
  imageSrc: text("image_src"),
  imageUrl: text("image_url"),
  imageAlt: varchar("image_alt", { length: 140 }),
  slotStatus: slotStatusEnum("slot_status").notNull().default("ready"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 5. Prestasi & Penghargaan ---

export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 55 }).notNull(),
  category: achievementCategoryEnum("category").notNull(),
  description: varchar("description", { length: 180 }).notNull(),
  recipientLabel: varchar("recipient_label", { length: 50 }).notNull(),
  organizerLabel: varchar("organizer_label", { length: 55 }).notNull(),
  imageSrc: text("image_src"),
  imageUrl: text("image_url"),
  imageAlt: varchar("image_alt", { length: 140 }),
  slotStatus: slotStatusEnum("slot_status").notNull().default("ready"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 6. Program Kerja & Kompartemen (3-Tier Hierarchy) ---

// Tier 1: Bidang Page
export const workProgramBidangs = pgTable("work_program_bidangs", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: bidangSlugEnum("slug").notNull().unique(),
  shortName: varchar("short_name", { length: 15 }).notNull(),
  title: varchar("title", { length: 25 }).notNull(),
  eyebrow: varchar("eyebrow", { length: 40 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  compartmentSummary: varchar("compartment_summary", { length: 50 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Tier 2: Compartment Stage
export const compartmentStages = pgTable("compartment_stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  bidangId: uuid("bidang_id")
    .references(() => workProgramBidangs.id, { onDelete: "cascade" })
    .notNull(),
  code: varchar("code", { length: 35 }).notNull(),
  name: varchar("name", { length: 35 }).notNull(),
  operationalPattern: operationalPatternEnum("operational_pattern").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Tier 3: Program Slides (Proker & Jobdesk)
export const programSlides = pgTable("program_slides", {
  id: uuid("id").defaultRandom().primaryKey(),
  compartmentId: uuid("compartment_id")
    .references(() => compartmentStages.id, { onDelete: "cascade" }),
  kind: programKindEnum("kind").notNull(),
  title: varchar("title", { length: 45 }).notNull(),
  description: varchar("description", { length: 200 }).notNull(),
  mediaSourceLabel: varchar("media_source_label", { length: 50 }),
  imageSrc: text("image_src"),
  imageAlt: varchar("image_alt", { length: 140 }),
  slotStatus: slotStatusEnum("slot_status").notNull().default("ready"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// --- 7. Testimonials ---

export const testimonials = pgTable("testimonials", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: testimonialCategoryEnum("category").notNull(),
  quote: varchar("quote", { length: 240 }).notNull(),
  authorLabel: varchar("author_label", { length: 40 }).notNull(),
  roleOrOrg: varchar("role_or_org", { length: 55 }).notNull(),
  verified: boolean("verified").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 8. Site Settings & Announcements ---

export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1), // Singleton id = 1
  googleDocsTemplateUrl: text("google_docs_template_url"),
  scoreWeightMeeting: integer("score_weight_meeting").notNull().default(5),
  scoreWeightProker: integer("score_weight_proker").notNull().default(10),
  ctaCollaborationHref: text("cta_collaboration_href").notNull().default("/partnership#ajukan"),
  ctaBusinessHref: text("cta_business_href").notNull().default("/bisnis-kader#daftar"),
  ctaAchievementHref: text("cta_achievement_href").notNull().default("/prestasi#lapor"),
  secretariatAddress: varchar("secretariat_address", { length: 150 }).notNull().default(
    "Student Center Lantai 2, Universitas Telkom, Jl. Telekomunikasi No. 1, Terusan Buahbatu, Bandung 40257"
  ),
  officialEmail: varchar("official_email", { length: 80 }).notNull().default("hipmipttelkom@gmail.com"),
  officialInstagram: varchar("official_instagram", { length: 40 }).notNull().default("@yechipmitelkom"),
  whatsappContactLabel: varchar("whatsapp_contact_label", { length: 60 }).notNull().default("Humas & Kemitraan HIPMI PT Telkom"),
  whatsappContactUrl: text("whatsapp_contact_url").notNull().default("https://wa.me/6281234567890"),
  copyrightText: varchar("copyright_text", { length: 80 }).notNull().default("© 2026 HIPMI PT Universitas Telkom. All rights reserved."),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  content: text("content").notNull(),
  targetAudience: announcementAudienceEnum("target_audience").notNull().default("BOTH"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- 9. News Articles (ERP Internal & UKM Web Profile) ---

export const newsArticles = pgTable("news_articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  category: newsCategoryEnum("category").notNull().default("Kegiatan"),
  summary: varchar("summary", { length: 240 }).notNull(),
  content: text("content").notNull(),
  imageSrc: text("image_src"),
  imageAlt: varchar("image_alt", { length: 140 }),
  slotStatus: slotStatusEnum("slot_status").notNull().default("pending-asset"),
  targetAudience: announcementAudienceEnum("target_audience").notNull().default("BOTH"),
  isFeatured: boolean("is_featured").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => kaders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Relations ---

export const kaderBusinessesRelations = relations(kaderBusinesses, ({ one }) => ({
  owner: one(kaders, {
    fields: [kaderBusinesses.kaderId],
    references: [kaders.id],
  }),
}));

export const workProgramBidangsRelations = relations(workProgramBidangs, ({ many }) => ({
  compartments: many(compartmentStages),
}));

export const compartmentStagesRelations = relations(compartmentStages, ({ one, many }) => ({
  bidang: one(workProgramBidangs, {
    fields: [compartmentStages.bidangId],
    references: [workProgramBidangs.id],
  }),
  slides: many(programSlides),
}));

export const programSlidesRelations = relations(programSlides, ({ one }) => ({
  compartment: one(compartmentStages, {
    fields: [programSlides.compartmentId],
    references: [compartmentStages.id],
  }),
}));
