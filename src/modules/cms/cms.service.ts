import { eq, desc, asc, and } from "drizzle-orm";
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
import { AppError } from "../../middlewares/error.middleware.js";
import { RevalidateService } from "../../services/revalidate.service.js";

export class CmsService {
  // =========================================================================
  // 1. Site Settings
  // =========================================================================
  static async getSettings() {
    let settings = await db.query.siteSettings.findFirst({
      where: eq(siteSettings.id, 1),
    });

    if (!settings) {
      const [created] = await db
        .insert(siteSettings)
        .values({ id: 1 })
        .returning();
      settings = created;
    }

    return settings;
  }

  static async updateSettings(data: any) {
    const existing = await this.getSettings();
    const [updated] = await db
      .update(siteSettings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(siteSettings.id, 1))
      .returning();

    RevalidateService.triggerRevalidation(["settings", "home"]);
    return updated;
  }

  // =========================================================================
  // 2. Announcements
  // =========================================================================
  static async getAnnouncements(filters?: { audience?: string; isActive?: boolean }) {
    const list = await db.query.announcements.findMany({
      orderBy: [desc(announcements.createdAt)],
    });

    return list.filter((a) => {
      if (filters?.audience && filters.audience !== "ALL" && a.targetAudience !== filters.audience) {
        return false;
      }
      if (filters?.isActive !== undefined && a.isActive !== filters.isActive) {
        return false;
      }
      return true;
    });
  }

  static async createAnnouncement(data: any) {
    const [created] = await db
      .insert(announcements)
      .values({
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      })
      .returning();

    RevalidateService.triggerRevalidation(["announcements", "home"]);
    return created;
  }

  static async updateAnnouncement(id: string, data: any) {
    const updatePayload: any = { ...data, updatedAt: new Date() };
    if (data.startDate) updatePayload.startDate = new Date(data.startDate);
    if (data.endDate) updatePayload.endDate = new Date(data.endDate);

    const [updated] = await db
      .update(announcements)
      .set(updatePayload)
      .where(eq(announcements.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Pengumuman tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["announcements", "home"]);
    return updated;
  }

  static async deleteAnnouncement(id: string) {
    const [deleted] = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Pengumuman tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["announcements", "home"]);
    return deleted;
  }

  // =========================================================================
  // 3. Hero Slides
  // =========================================================================
  static async getHeroSlides() {
    const slides = await db.query.heroSlides.findMany({
      orderBy: [asc(heroSlides.sortOrder), desc(heroSlides.createdAt)],
    });

    // Compute dynamic indexLabel (e.g. 01 / 05)
    const total = slides.length;
    return slides.map((s, idx) => ({
      ...s,
      indexLabel: s.indexLabel || `${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    }));
  }

  static async createHeroSlide(data: any) {
    const [created] = await db
      .insert(heroSlides)
      .values(data)
      .returning();

    RevalidateService.triggerRevalidation(["home", "hero"]);
    return created;
  }

  static async updateHeroSlide(id: string, data: any) {
    const [updated] = await db
      .update(heroSlides)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(heroSlides.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Hero slide tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["home", "hero"]);
    return updated;
  }

  static async deleteHeroSlide(id: string) {
    const [deleted] = await db
      .delete(heroSlides)
      .where(eq(heroSlides.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Hero slide tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["home", "hero"]);
    return deleted;
  }

  static async reorderHeroSlides(items: { id: string; sortOrder: number }[]) {
    for (const item of items) {
      await db
        .update(heroSlides)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(heroSlides.id, item.id));
    }

    RevalidateService.triggerRevalidation(["home", "hero"]);
    return await this.getHeroSlides();
  }

  // =========================================================================
  // 4. Tentang & 3 Pilar
  // =========================================================================
  static async getTentang() {
    let profile = await db.query.tentangProfile.findFirst({
      where: eq(tentangProfile.id, 1),
    });

    if (!profile) {
      const [created] = await db
        .insert(tentangProfile)
        .values({
          id: 1,
          eyebrow: "TENTANG HIPMI PT",
          title: "Membentuk Karakter Wirausaha Tangguh Mahasiswa Telkom",
          description: "HIPMI PT Universitas Telkom adalah organisasi kemahasiswaan pencetak kader pengusaha muda unggul.",
        })
        .returning();
      profile = created;
    }

    const pillars = await db.query.tentangPillars.findMany({
      orderBy: [asc(tentangPillars.sortOrder)],
    });

    return {
      ...profile,
      pillars,
    };
  }

  static async updateTentang(data: any) {
    const existing = await this.getTentang();
    const { pillars, ...profileData } = data;

    const [updatedProfile] = await db
      .update(tentangProfile)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(tentangProfile.id, 1))
      .returning();

    if (pillars && Array.isArray(pillars) && pillars.length === 3) {
      await this.replacePillars(pillars);
    }

    RevalidateService.triggerRevalidation(["home", "tentang"]);
    return await this.getTentang();
  }

  static async replacePillars(pillarsList: { title: string; description: string; sortOrder?: number }[]) {
    if (pillarsList.length !== 3) {
      throw new AppError(422, "UNPROCESSABLE_ENTITY", "Tentang harus memiliki tepat 3 pilar aktif");
    }

    // Delete existing pillars and insert new exactly 3
    await db.delete(tentangPillars);

    const inserted: any[] = [];
    for (let i = 0; i < pillarsList.length; i++) {
      const p = pillarsList[i];
      const [res] = await db
        .insert(tentangPillars)
        .values({
          title: p.title,
          description: p.description,
          sortOrder: p.sortOrder !== undefined ? p.sortOrder : i + 1,
          updatedAt: new Date(),
        })
        .returning();
      inserted.push(res);
    }

    RevalidateService.triggerRevalidation(["home", "tentang"]);
    return inserted;
  }

  // =========================================================================
  // 5. Partnerships / Mitra
  // =========================================================================
  static async getPartners(category?: string) {
    let list = await db.query.partners.findMany({
      orderBy: [asc(partners.sortOrder), desc(partners.createdAt)],
    });

    if (category) {
      list = list.filter((p) => p.category === category);
    }
    return list;
  }

  static async createPartner(data: any) {
    const imageSrc = data.imageSrc || data.logoUrl || "https://storage.hipmi-pt.id/default-partner.png";
    const [created] = await db
      .insert(partners)
      .values({
        ...data,
        imageSrc,
      })
      .returning();

    RevalidateService.triggerRevalidation(["partners", "home"]);
    return created;
  }

  static async updatePartner(id: string, data: any) {
    const updatePayload = { ...data, updatedAt: new Date() };
    if (data.logoUrl && !data.imageSrc) {
      updatePayload.imageSrc = data.logoUrl;
    }

    const [updated] = await db
      .update(partners)
      .set(updatePayload)
      .where(eq(partners.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Data mitra tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["partners", "home"]);
    return updated;
  }

  static async deletePartner(id: string) {
    const [deleted] = await db
      .delete(partners)
      .where(eq(partners.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Data mitra tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["partners", "home"]);
    return deleted;
  }

  // =========================================================================
  // 6. Bisnis Kader
  // =========================================================================
  static async getKaderBusinesses(sector?: string, slotStatus?: string) {
    let list = await db.query.kaderBusinesses.findMany({
      orderBy: [asc(kaderBusinesses.sortOrder), desc(kaderBusinesses.createdAt)],
    });

    if (sector) {
      list = list.filter((b) => b.sector === sector);
    }
    if (slotStatus) {
      list = list.filter((b) => b.slotStatus === slotStatus);
    }
    return list;
  }

  static async createKaderBusiness(data: any) {
    const imageSrc = data.imageSrc || data.imageUrl || null;
    const imageUrl = data.imageUrl || data.imageSrc || null;
    const ownerLabel = data.ownerLabel || data.ownerName || "";
    const ownerName = data.ownerName || data.ownerLabel || null;
    const [created] = await db
      .insert(kaderBusinesses)
      .values({
        ...data,
        imageSrc,
        imageUrl,
        ownerLabel,
        ownerName,
      })
      .returning();

    RevalidateService.triggerRevalidation(["businesses", "home"]);
    return created;
  }

  static async updateKaderBusiness(id: string, data: any) {
    const updatePayload: any = { ...data, updatedAt: new Date() };
    if (data.imageUrl && !data.imageSrc) {
      updatePayload.imageSrc = data.imageUrl;
    }
    if (data.imageSrc && !data.imageUrl) {
      updatePayload.imageUrl = data.imageSrc;
    }
    if (data.ownerName && !data.ownerLabel) {
      updatePayload.ownerLabel = data.ownerName;
    }
    if (data.ownerLabel && !data.ownerName) {
      updatePayload.ownerName = data.ownerLabel;
    }

    const [updated] = await db
      .update(kaderBusinesses)
      .set(updatePayload)
      .where(eq(kaderBusinesses.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Bisnis kader tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["businesses", "home"]);
    return updated;
  }

  static async deleteKaderBusiness(id: string) {
    const [deleted] = await db
      .delete(kaderBusinesses)
      .where(eq(kaderBusinesses.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Bisnis kader tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["businesses", "home"]);
    return deleted;
  }

  // =========================================================================
  // 7. Prestasi & Penghargaan
  // =========================================================================
  static async getAchievements(category?: string, slotStatus?: string) {
    let list = await db.query.achievements.findMany({
      orderBy: [asc(achievements.sortOrder), desc(achievements.createdAt)],
    });

    if (category) {
      list = list.filter((a) => a.category === category);
    }
    if (slotStatus) {
      list = list.filter((a) => a.slotStatus === slotStatus);
    }
    return list;
  }

  static async createAchievement(data: any) {
    const imageSrc = data.imageSrc || data.imageUrl || null;
    const [created] = await db
      .insert(achievements)
      .values({
        ...data,
        imageSrc,
      })
      .returning();

    RevalidateService.triggerRevalidation(["achievements", "home"]);
    return created;
  }

  static async updateAchievement(id: string, data: any) {
    const updatePayload = { ...data, updatedAt: new Date() };
    if (data.imageUrl && !data.imageSrc) {
      updatePayload.imageSrc = data.imageUrl;
    }

    const [updated] = await db
      .update(achievements)
      .set(updatePayload)
      .where(eq(achievements.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Prestasi tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["achievements", "home"]);
    return updated;
  }

  static async deleteAchievement(id: string) {
    const [deleted] = await db
      .delete(achievements)
      .where(eq(achievements.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Prestasi tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["achievements", "home"]);
    return deleted;
  }

  // =========================================================================
  // 8. Testimonials
  // =========================================================================
  static async getTestimonials(filters?: { verified?: boolean; category?: string }) {
    let list = await db.query.testimonials.findMany({
      orderBy: [asc(testimonials.sortOrder), desc(testimonials.createdAt)],
    });

    if (filters?.verified !== undefined) {
      list = list.filter((t) => t.verified === filters.verified);
    }
    if (filters?.category) {
      list = list.filter((t) => t.category === filters.category);
    }
    return list;
  }

  static async createTestimonial(data: any) {
    const [created] = await db
      .insert(testimonials)
      .values(data)
      .returning();

    RevalidateService.triggerRevalidation(["testimonials", "home"]);
    return created;
  }

  static async updateTestimonial(id: string, data: any) {
    const [updated] = await db
      .update(testimonials)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(testimonials.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Testimoni tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["testimonials", "home"]);
    return updated;
  }

  static async verifyTestimonial(id: string, verified: boolean) {
    const [updated] = await db
      .update(testimonials)
      .set({ verified, updatedAt: new Date() })
      .where(eq(testimonials.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Testimoni tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["testimonials", "home"]);
    return updated;
  }

  static async deleteTestimonial(id: string) {
    const [deleted] = await db
      .delete(testimonials)
      .where(eq(testimonials.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Testimoni tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["testimonials", "home"]);
    return deleted;
  }

  // =========================================================================
  // 9. Program Kerja & Kompartemen (3-Tier Hierarchy)
  // =========================================================================
  static async getAllProgramKerja() {
    const bidangs = await db.query.workProgramBidangs.findMany({
      orderBy: [asc(workProgramBidangs.sortOrder)],
      with: {
        compartments: {
          orderBy: [asc(compartmentStages.sortOrder)],
          with: {
            slides: {
              orderBy: [asc(programSlides.sortOrder)],
            },
          },
        },
      },
    });

    return bidangs;
  }

  static async getProgramKerjaBySlug(slug: "okk" | "medkominfo" | "eksternal" | "ekraf") {
    const bidang = await db.query.workProgramBidangs.findFirst({
      where: eq(workProgramBidangs.slug, slug),
      with: {
        compartments: {
          orderBy: [asc(compartmentStages.sortOrder)],
          with: {
            slides: {
              orderBy: [asc(programSlides.sortOrder)],
            },
          },
        },
      },
    });

    if (!bidang) {
      throw new AppError(404, "NOT_FOUND", `Bidang [${slug}] tidak ditemukan`);
    }

    // Format for frontend consumption
    let totalProker = 0;
    let totalJobdesk = 0;

    const formattedCompartments = (bidang.compartments || []).map((comp: any) => {
      const prokerSlides = (comp.slides || []).filter((s: any) => s.kind === "proker");
      const jobdeskSlides = (comp.slides || []).filter((s: any) => s.kind === "jobdesk");

      totalProker += prokerSlides.length;
      totalJobdesk += jobdeskSlides.length;

      let patternLabel = "Program Kerja & Jobdesk";
      if (comp.operationalPattern === "proker-only") {
        patternLabel = "Hanya Program Kerja";
      } else if (comp.operationalPattern === "jobdesk-only") {
        patternLabel = "Hanya Jobdesk";
      }

      return {
        id: comp.id,
        code: comp.code,
        name: comp.name,
        operationalPattern: comp.operationalPattern,
        patternLabel,
        sortOrder: comp.sortOrder,
        prokerSlides,
        jobdeskSlides,
      };
    });

    const summaryStats = `${formattedCompartments.length} Kompartemen, ${totalProker} Program Kerja & ${totalJobdesk} Jobdesk`;

    return {
      id: bidang.id,
      slug: bidang.slug,
      shortName: bidang.shortName,
      title: bidang.title,
      eyebrow: bidang.eyebrow,
      description: bidang.description,
      compartmentSummary: bidang.compartmentSummary,
      summaryStats,
      compartments: formattedCompartments,
    };
  }

  static async updateBidang(id: string, data: any) {
    const [updated] = await db
      .update(workProgramBidangs)
      .set(data)
      .where(eq(workProgramBidangs.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Bidang tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["programs", `program-${updated.slug}`, "home"]);
    return updated;
  }

  static async upsertBidang(data: any) {
    const existing = await db.query.workProgramBidangs.findFirst({
      where: eq(workProgramBidangs.slug, data.slug),
    });

    if (existing) {
      const [updated] = await db
        .update(workProgramBidangs)
        .set(data)
        .where(eq(workProgramBidangs.id, existing.id))
        .returning();
      RevalidateService.triggerRevalidation(["programs", `program-${data.slug}`, "home"]);
      return updated;
    } else {
      const [created] = await db
        .insert(workProgramBidangs)
        .values(data)
        .returning();
      RevalidateService.triggerRevalidation(["programs", `program-${data.slug}`, "home"]);
      return created;
    }
  }

  static async createCompartment(data: any) {
    const [created] = await db
      .insert(compartmentStages)
      .values(data)
      .returning();

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return created;
  }

  static async updateCompartment(id: string, data: any) {
    const [updated] = await db
      .update(compartmentStages)
      .set(data)
      .where(eq(compartmentStages.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Kompartemen tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return updated;
  }

  static async deleteCompartment(id: string) {
    const [deleted] = await db
      .delete(compartmentStages)
      .where(eq(compartmentStages.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Kompartemen tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return deleted;
  }

  static async createProgramSlide(data: any) {
    const [created] = await db
      .insert(programSlides)
      .values(data)
      .returning();

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return created;
  }

  static async updateProgramSlide(id: string, data: any) {
    const [updated] = await db
      .update(programSlides)
      .set(data)
      .where(eq(programSlides.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Program slide tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return updated;
  }

  static async deleteProgramSlide(id: string) {
    const [deleted] = await db
      .delete(programSlides)
      .where(eq(programSlides.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Program slide tidak ditemukan");
    }

    RevalidateService.triggerRevalidation(["programs", "home"]);
    return deleted;
  }
}
