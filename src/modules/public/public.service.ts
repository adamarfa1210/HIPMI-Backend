import { eq, asc, desc, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  heroSlides,
  tentangProfile,
  tentangPillars,
  partners,
  kaderBusinesses,
  achievements,
  workProgramBidangs,
  compartmentStages,
  programSlides,
  testimonials,
  siteSettings,
  announcements,
} from "../../db/schema/cms.js";
import { CmsService } from "../cms/cms.service.js";
import { AppError } from "../../middlewares/error.middleware.js";

export class PublicService {
  /**
   * Aggregates all homepage payload in one call
   */
  static async getHomeData() {
    // 1. Hero slides
    const rawSlides = await db.query.heroSlides.findMany({
      where: eq(heroSlides.isPublished, true),
      orderBy: [asc(heroSlides.sortOrder), desc(heroSlides.createdAt)],
    });
    const totalSlides = rawSlides.length;
    const slides = rawSlides.map((s, idx) => ({
      id: s.id,
      indexLabel: s.indexLabel || `${String(idx + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`,
      title: s.title,
      subtitle: s.subtitle,
      imageSrc: s.imageSrc,
      imageAlt: s.imageAlt,
      sortOrder: s.sortOrder,
    }));

    // 2. Tentang & Pillars
    const tentang = await CmsService.getTentang();

    // 3. Stats calculation
    const allBidangs = await db.query.workProgramBidangs.findMany({
      orderBy: [asc(workProgramBidangs.sortOrder)],
    });
    const allCompartments = await db.query.compartmentStages.findMany();
    const allSlides = await db.query.programSlides.findMany();
    const allPartners = await db.query.partners.findMany({
      where: eq(partners.isPublished, true),
    });

    const stats = {
      bidangCount: allBidangs.length || 4,
      compartmentCount: allCompartments.length,
      prokerJobdeskCount: allSlides.length,
      partnerCount: allPartners.length,
    };

    const bidangs = allBidangs.map((b) => ({
      id: b.id,
      slug: b.slug,
      shortName: b.shortName,
      title: b.title,
      compartmentSummary: b.compartmentSummary,
    }));

    // 4. Public announcements
    const now = new Date();
    const rawAnnouncements = await db.query.announcements.findMany({
      where: eq(announcements.isActive, true),
      orderBy: [desc(announcements.createdAt)],
    });
    const activeAnnouncements = rawAnnouncements
      .filter((a) => a.targetAudience === "PUBLIC" || a.targetAudience === "BOTH")
      .map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        startDate: a.startDate,
        endDate: a.endDate,
      }));

    // 5. Site settings
    const settings = await CmsService.getSettings();

    return {
      heroSlides: slides,
      tentang: {
        eyebrow: tentang.eyebrow,
        title: tentang.title,
        description: tentang.description,
        secondaryDescription: tentang.secondaryDescription,
        videoPosterSrc: tentang.videoPosterSrc,
        videoUrl: tentang.videoUrl,
        pillars: (tentang.pillars || []).map((p: any) => ({
          id: p.id,
          title: p.title,
          description: p.description,
        })),
      },
      stats,
      bidangs,
      announcements: activeAnnouncements,
      siteSettings: {
        secretariatAddress: settings.secretariatAddress,
        officialEmail: settings.officialEmail,
        officialInstagram: settings.officialInstagram,
        whatsappContactLabel: settings.whatsappContactLabel,
        whatsappContactUrl: settings.whatsappContactUrl,
        copyrightText: settings.copyrightText,
        ctaCollaborationHref: settings.ctaCollaborationHref,
        ctaBusinessHref: settings.ctaBusinessHref,
        ctaAchievementHref: settings.ctaAchievementHref,
      },
    };
  }

  /**
   * Published partners
   */
  static async getPartners(category?: string) {
    let list = await db.query.partners.findMany({
      where: eq(partners.isPublished, true),
      orderBy: [asc(partners.sortOrder), desc(partners.createdAt)],
    });

    if (category) {
      list = list.filter((p) => p.category === category);
    }
    return list;
  }

  /**
   * Published kader businesses
   */
  static async getKaderBusinesses(sector?: string) {
    let list = await db.query.kaderBusinesses.findMany({
      where: eq(kaderBusinesses.isPublished, true),
      orderBy: [asc(kaderBusinesses.sortOrder), desc(kaderBusinesses.createdAt)],
    });

    if (sector) {
      list = list.filter((b) => b.sector === sector);
    }
    return list;
  }

  /**
   * Published achievements
   */
  static async getAchievements(category?: string) {
    let list = await db.query.achievements.findMany({
      where: eq(achievements.isPublished, true),
      orderBy: [asc(achievements.sortOrder), desc(achievements.createdAt)],
    });

    if (category) {
      list = list.filter((a) => a.category === category);
    }
    return list;
  }

  /**
   * Public Program Kerja list (all 4 Bidangs)
   */
  static async getAllProgramKerja() {
    const bidangs = await db.query.workProgramBidangs.findMany({
      orderBy: [asc(workProgramBidangs.sortOrder)],
    });
    return await Promise.all(
      bidangs.map((b) => this.getProgramKerjaByBidang(b.slug))
    );
  }

  /**
   * Public Program Kerja by Bidang Slug
   */
  static async getProgramKerjaByBidang(slug: "okk" | "medkominfo" | "eksternal" | "ekraf") {
    return await CmsService.getProgramKerjaBySlug(slug);
  }

  /**
   * Verified & published testimonials ONLY
   */
  static async getTestimonials(category?: string) {
    let list = await db.query.testimonials.findMany({
      where: and(
        eq(testimonials.verified, true),
        eq(testimonials.isPublished, true)
      ),
      orderBy: [asc(testimonials.sortOrder), desc(testimonials.createdAt)],
    });

    if (category) {
      list = list.filter((t) => t.category === category);
    }
    return list;
  }

  /**
   * Public site config
   */
  static async getSiteConfig() {
    const settings = await CmsService.getSettings();
    return {
      secretariatAddress: settings.secretariatAddress,
      officialEmail: settings.officialEmail,
      officialInstagram: settings.officialInstagram,
      whatsappContactLabel: settings.whatsappContactLabel,
      whatsappContactUrl: settings.whatsappContactUrl,
      copyrightText: settings.copyrightText,
      ctaCollaborationHref: settings.ctaCollaborationHref,
      ctaBusinessHref: settings.ctaBusinessHref,
      ctaAchievementHref: settings.ctaAchievementHref,
      googleDocsTemplateUrl: settings.googleDocsTemplateUrl,
    };
  }
}
