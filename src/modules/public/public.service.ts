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
    // Run independent public queries in parallel to minimize round-trips to Supabase
    const [
      rawSlides,
      tentang,
      allBidangs,
      allCompartments,
      allSlides,
      allPartners,
      rawAnnouncements,
      settings,
    ] = await Promise.all([
      db.query.heroSlides.findMany({
        where: eq(heroSlides.isPublished, true),
        orderBy: [asc(heroSlides.sortOrder), desc(heroSlides.createdAt)],
      }),
      CmsService.getTentang(),
      db.query.workProgramBidangs.findMany({
        orderBy: [asc(workProgramBidangs.sortOrder)],
      }),
      db.query.compartmentStages.findMany(),
      db.query.programSlides.findMany(),
      db.query.partners.findMany({
        where: eq(partners.isPublished, true),
      }),
      db.query.announcements.findMany({
        where: eq(announcements.isActive, true),
        orderBy: [desc(announcements.createdAt)],
      }),
      CmsService.getSettings(),
    ]);

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

    const activeBidangs = allBidangs.filter((b) => Boolean(b.title || b.description || b.compartmentSummary));

    const stats = {
      bidangCount: activeBidangs.length,
      compartmentCount: allCompartments.length,
      prokerJobdeskCount: allSlides.length,
      partnerCount: allPartners.length,
    };

    const bidangs = activeBidangs.map((b) => ({
      id: b.id,
      slug: b.slug,
      shortName: b.shortName,
      title: b.title,
      compartmentSummary: b.compartmentSummary,
    }));

    const activeAnnouncements = rawAnnouncements
      .filter((a) => a.targetAudience === "PUBLIC" || a.targetAudience === "BOTH")
      .map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        startDate: a.startDate,
        endDate: a.endDate,
      }));

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
