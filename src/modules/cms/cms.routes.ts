import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { CmsService } from "./cms.service.js";
import { MediaService } from "../../services/media.service.js";
import {
  heroSlideSchema,
  heroSlideUpdateSchema,
  tentangProfileSchema,
  tentangPillarsReplaceSchema,
  partnerSchema,
  partnerUpdateSchema,
  bisnisKaderSchema,
  bisnisKaderUpdateSchema,
  prestasiSchema,
  prestasiUpdateSchema,
  testimoniSchema,
  testimoniUpdateSchema,
  programBidangSchema,
  programBidangUpdateSchema,
  compartmentSchema,
  compartmentUpdateSchema,
  programSlideSchema,
  programSlideUpdateSchema,
  siteSettingsSchema,
  siteSettingsUpdateSchema,
  announcementSchema,
  announcementUpdateSchema,
} from "../../utils/validators.js";

export const cmsRouter = new Hono();

// All CMS routes require authentication
cmsRouter.use("*", authMiddleware);

// Validation helper returning 400 with structured errors
const validateBody = (schema: z.ZodSchema) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const errorList = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      const message =
        "Validation failed: " +
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      return c.json(
        {
          success: false,
          message,
          error: {
            code: "VALIDATION_ERROR",
            message,
            details: errorList,
          },
          errors: errorList,
        },
        400
      );
    }
  });

// ===========================================================================
// 1. Site Settings
// ===========================================================================
cmsRouter.get("/settings", rbacMiddleware("cms", "read"), async (c) => {
  const settings = await CmsService.getSettings();
  return c.json({ success: true, data: settings });
});

cmsRouter.patch(
  "/settings",
  rbacMiddleware("cms", "update"),
  validateBody(siteSettingsUpdateSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateSettings(data);
    return c.json({ success: true, message: "Pengaturan situs berhasil diperbarui", data: updated });
  }
);

cmsRouter.put(
  "/site-settings",
  rbacMiddleware("cms", "update"),
  validateBody(siteSettingsSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateSettings(data);
    return c.json({ success: true, message: "Pengaturan situs berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/settings", rbacMiddleware("cms", "delete"), async (c) => {
  const cleared = await CmsService.clearSettings();
  return c.json({ success: true, message: "Pengaturan situs berhasil dikosongkan", data: cleared });
});

// ===========================================================================
// 2. Announcements
// ===========================================================================
cmsRouter.get("/announcements", rbacMiddleware("cms", "read"), async (c) => {
  const audience = c.req.query("audience");
  const isActiveStr = c.req.query("isActive");
  const isActive = isActiveStr !== undefined ? isActiveStr === "true" : undefined;

  const data = await CmsService.getAnnouncements({ audience, isActive });
  return c.json({ success: true, data });
});

cmsRouter.post(
  "/announcements",
  rbacMiddleware("cms", "create"),
  validateBody(announcementSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createAnnouncement(data);
    return c.json({ success: true, message: "Pengumuman berhasil dibuat", data: created }, 201);
  }
);

cmsRouter.patch(
  "/announcements/:id",
  rbacMiddleware("cms", "update"),
  validateBody(announcementUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateAnnouncement(id, data);
    return c.json({ success: true, message: "Pengumuman berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/announcements/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteAnnouncement(id);
  return c.json({ success: true, message: "Pengumuman berhasil dihapus", data: deleted });
});

// ===========================================================================
// 3. Hero Slides
// ===========================================================================
const handleGetHeroSlides = async (c: any) => {
  const data = await CmsService.getHeroSlides();
  return c.json({ success: true, data });
};

const handleCreateHeroSlide = async (c: any) => {
  const data = c.req.valid("json" as never);
  const created = await CmsService.createHeroSlide(data);
  return c.json({ success: true, message: "Hero slide berhasil dibuat", data: created }, 201);
};

cmsRouter.get("/hero-slides", rbacMiddleware("cms", "read"), handleGetHeroSlides);
cmsRouter.get("/hero", rbacMiddleware("cms", "read"), handleGetHeroSlides);

cmsRouter.post("/hero-slides", rbacMiddleware("cms", "create"), validateBody(heroSlideSchema), handleCreateHeroSlide);
cmsRouter.post("/hero", rbacMiddleware("cms", "create"), validateBody(heroSlideSchema), handleCreateHeroSlide);

cmsRouter.patch("/hero-slides/reorder", rbacMiddleware("cms", "update"), async (c) => {
  const body = await c.req.json();
  const items = body.items || [];
  const updated = await CmsService.reorderHeroSlides(items);
  return c.json({ success: true, message: "Urutan slide berhasil diperbarui", data: updated });
});

cmsRouter.patch(
  "/hero-slides/:id",
  rbacMiddleware("cms", "update"),
  validateBody(heroSlideUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateHeroSlide(id, data);
    return c.json({ success: true, message: "Hero slide berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/hero-slides/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteHeroSlide(id);
  return c.json({ success: true, message: "Hero slide berhasil dihapus", data: deleted });
});

// ===========================================================================
// 4. Tentang & 3 Pilar
// ===========================================================================
cmsRouter.get("/tentang", rbacMiddleware("cms", "read"), async (c) => {
  const data = await CmsService.getTentang();
  return c.json({ success: true, data });
});

cmsRouter.patch(
  "/tentang",
  rbacMiddleware("cms", "update"),
  validateBody(tentangProfileSchema.partial()),
  async (c) => {
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateTentang(data);
    return c.json({ success: true, message: "Profil organisasi berhasil diperbarui", data: updated });
  }
);

// Support POST /tentang as used in boundary suites
cmsRouter.post(
  "/tentang",
  rbacMiddleware("cms", "update"),
  validateBody(tentangProfileSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateTentang(data);
    return c.json({ success: true, message: "Profil organisasi berhasil diperbarui", data: updated }, 201);
  }
);

cmsRouter.put(
  "/tentang/pillars",
  rbacMiddleware("cms", "update"),
  validateBody(tentangPillarsReplaceSchema),
  async (c) => {
    const { pillars } = c.req.valid("json" as never) as { pillars: any[] };
    const updated = await CmsService.replacePillars(pillars);
    return c.json({ success: true, message: "3 Pilar aktif berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/tentang", rbacMiddleware("cms", "delete"), async (c) => {
  const cleared = await CmsService.clearTentang();
  return c.json({ success: true, message: "Profil Tentang & Pilar berhasil dikosongkan", data: cleared });
});

// ===========================================================================
// 5. Partnerships / Mitra
// ===========================================================================
cmsRouter.get("/partners", rbacMiddleware("cms", "read"), async (c) => {
  const category = c.req.query("category");
  const data = await CmsService.getPartners(category);
  return c.json({ success: true, data });
});

cmsRouter.post(
  "/partners",
  rbacMiddleware("cms", "create"),
  validateBody(partnerSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createPartner(data);
    return c.json({ success: true, message: "Mitra berhasil ditambahkan", data: created }, 201);
  }
);

cmsRouter.patch(
  "/partners/:id",
  rbacMiddleware("cms", "update"),
  validateBody(partnerUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updatePartner(id, data);
    return c.json({ success: true, message: "Mitra berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/partners/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deletePartner(id);
  return c.json({ success: true, message: "Mitra berhasil dihapus", data: deleted });
});

// ===========================================================================
// 6. Bisnis Kader
// ===========================================================================
const handleGetKaderBusinesses = async (c: any) => {
  const sector = c.req.query("sector");
  const slotStatus = c.req.query("slotStatus");
  const data = await CmsService.getKaderBusinesses(sector, slotStatus);
  return c.json({ success: true, data });
};

const handleCreateKaderBusiness = async (c: any) => {
  const data = c.req.valid("json" as never);
  const created = await CmsService.createKaderBusiness(data);
  return c.json({ success: true, message: "Bisnis kader berhasil ditambahkan", data: created }, 201);
};

cmsRouter.get("/kader-businesses", rbacMiddleware("cms", "read"), handleGetKaderBusinesses);
cmsRouter.get("/bisnis-kader", rbacMiddleware("cms", "read"), handleGetKaderBusinesses);

cmsRouter.post("/kader-businesses", rbacMiddleware("cms", "create"), validateBody(bisnisKaderSchema), handleCreateKaderBusiness);
cmsRouter.post("/bisnis-kader", rbacMiddleware("cms", "create"), validateBody(bisnisKaderSchema), handleCreateKaderBusiness);

cmsRouter.patch(
  "/kader-businesses/:id",
  rbacMiddleware("cms", "update"),
  validateBody(bisnisKaderUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateKaderBusiness(id, data);
    return c.json({ success: true, message: "Bisnis kader berhasil diperbarui", data: updated });
  }
);
cmsRouter.patch(
  "/bisnis-kader/:id",
  rbacMiddleware("cms", "update"),
  validateBody(bisnisKaderUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateKaderBusiness(id, data);
    return c.json({ success: true, message: "Bisnis kader berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/kader-businesses/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteKaderBusiness(id);
  return c.json({ success: true, message: "Bisnis kader berhasil dihapus", data: deleted });
});
cmsRouter.delete("/bisnis-kader/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteKaderBusiness(id);
  return c.json({ success: true, message: "Bisnis kader berhasil dihapus", data: deleted });
});

// ===========================================================================
// 7. Prestasi & Penghargaan
// ===========================================================================
const handleGetAchievements = async (c: any) => {
  const category = c.req.query("category");
  const slotStatus = c.req.query("slotStatus");
  const data = await CmsService.getAchievements(category, slotStatus);
  return c.json({ success: true, data });
};

const handleCreateAchievement = async (c: any) => {
  const data = c.req.valid("json" as never);
  const created = await CmsService.createAchievement(data);
  return c.json({ success: true, message: "Prestasi berhasil ditambahkan", data: created }, 201);
};

cmsRouter.get("/achievements", rbacMiddleware("cms", "read"), handleGetAchievements);
cmsRouter.get("/prestasi", rbacMiddleware("cms", "read"), handleGetAchievements);

cmsRouter.post("/achievements", rbacMiddleware("cms", "create"), validateBody(prestasiSchema), handleCreateAchievement);
cmsRouter.post("/prestasi", rbacMiddleware("cms", "create"), validateBody(prestasiSchema), handleCreateAchievement);

cmsRouter.patch(
  "/achievements/:id",
  rbacMiddleware("cms", "update"),
  validateBody(prestasiUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateAchievement(id, data);
    return c.json({ success: true, message: "Prestasi berhasil diperbarui", data: updated });
  }
);
cmsRouter.patch(
  "/prestasi/:id",
  rbacMiddleware("cms", "update"),
  validateBody(prestasiUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateAchievement(id, data);
    return c.json({ success: true, message: "Prestasi berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/achievements/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteAchievement(id);
  return c.json({ success: true, message: "Prestasi berhasil dihapus", data: deleted });
});
cmsRouter.delete("/prestasi/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteAchievement(id);
  return c.json({ success: true, message: "Prestasi berhasil dihapus", data: deleted });
});

// ===========================================================================
// 8. Testimonials
// ===========================================================================
cmsRouter.get("/testimonials", rbacMiddleware("cms", "read"), async (c) => {
  const verifiedStr = c.req.query("verified");
  const verified = verifiedStr !== undefined ? verifiedStr === "true" : undefined;
  const category = c.req.query("category");

  const data = await CmsService.getTestimonials({ verified, category });
  return c.json({ success: true, data });
});

cmsRouter.post(
  "/testimonials",
  rbacMiddleware("cms", "create"),
  validateBody(testimoniSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createTestimonial(data);
    return c.json({ success: true, message: "Testimoni berhasil ditambahkan", data: created }, 201);
  }
);

cmsRouter.patch(
  "/testimonials/:id",
  rbacMiddleware("cms", "update"),
  validateBody(testimoniUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateTestimonial(id, data);
    return c.json({ success: true, message: "Testimoni berhasil diperbarui", data: updated });
  }
);

cmsRouter.patch("/testimonials/:id/verify", rbacMiddleware("cms", "approve"), async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const verified = body.verified !== undefined ? Boolean(body.verified) : true;
  const updated = await CmsService.verifyTestimonial(id, verified);
  return c.json({ success: true, message: `Status verifikasi testimoni diubah menjadi ${verified}`, data: updated });
});

cmsRouter.delete("/testimonials/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteTestimonial(id);
  return c.json({ success: true, message: "Testimoni berhasil dihapus", data: deleted });
});

// ===========================================================================
// 9. Program Kerja & Kompartemen
// ===========================================================================
cmsRouter.get("/program-kerja", rbacMiddleware("cms", "read"), async (c) => {
  const data = await CmsService.getAllProgramKerja();
  return c.json({ success: true, data });
});

cmsRouter.post(
  "/program-kerja",
  rbacMiddleware("cms", "create"),
  validateBody(programBidangSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const result = await CmsService.upsertBidang(data);
    return c.json({ success: true, message: "Bidang program kerja berhasil disimpan", data: result }, 201);
  }
);

cmsRouter.patch(
  "/program-kerja/bidang/:id",
  rbacMiddleware("cms", "update"),
  validateBody(programBidangUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateBidang(id, data);
    return c.json({ success: true, message: "Bidang berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/program-kerja/bidang/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const cleared = await CmsService.clearBidangContent(id);
  return c.json({ success: true, message: "Konten bidang berhasil dikosongkan", data: cleared });
});

cmsRouter.post(
  "/program-kerja/compartment",
  rbacMiddleware("cms", "create"),
  validateBody(compartmentSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createCompartment(data);
    return c.json({ success: true, message: "Kompartemen berhasil ditambahkan", data: created }, 201);
  }
);

cmsRouter.patch(
  "/program-kerja/compartment/:id",
  rbacMiddleware("cms", "update"),
  validateBody(compartmentUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateCompartment(id, data);
    return c.json({ success: true, message: "Kompartemen berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/program-kerja/compartment/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteCompartment(id);
  return c.json({ success: true, message: "Kompartemen berhasil dihapus", data: deleted });
});

cmsRouter.post(
  "/program-kerja/slide",
  rbacMiddleware("cms", "create"),
  validateBody(programSlideSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createProgramSlide(data);
    return c.json({ success: true, message: "Slide berhasil ditambahkan", data: created }, 201);
  }
);

cmsRouter.post(
  "/program-slides",
  rbacMiddleware("cms", "create"),
  validateBody(programSlideSchema),
  async (c) => {
    const data = c.req.valid("json" as never);
    const created = await CmsService.createProgramSlide(data);
    return c.json({ success: true, message: "Slide berhasil ditambahkan", data: created }, 201);
  }
);

cmsRouter.patch(
  "/program-kerja/slide/:id",
  rbacMiddleware("cms", "update"),
  validateBody(programSlideUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json" as never);
    const updated = await CmsService.updateProgramSlide(id, data);
    return c.json({ success: true, message: "Slide berhasil diperbarui", data: updated });
  }
);

cmsRouter.delete("/program-kerja/slide/:id", rbacMiddleware("cms", "delete"), async (c) => {
  const id = c.req.param("id")!;
  const deleted = await CmsService.deleteProgramSlide(id);
  return c.json({ success: true, message: "Slide berhasil dihapus", data: deleted });
});

// ===========================================================================
// 10. Media Upload
// ===========================================================================
const handleMediaUpload = async (c: any) => {
  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new AppError(400, "BAD_REQUEST", "Content-Type harus multipart/form-data");
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const slot = (formData.get("slot") as string) || "hero-home";
  const imageAlt = (formData.get("imageAlt") as string) || undefined;

  if (!file) {
    throw new AppError(400, "BAD_REQUEST", "File gambar tidak ditemukan");
  }

  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const result = await MediaService.processImage({
    buffer,
    contentType: file.type,
    slot,
    filename: file.name,
    imageAlt,
  });

  return c.json({ success: true, message: "Media berhasil diproses dan diunggah", data: result }, 201);
};

cmsRouter.post("/media/upload", rbacMiddleware("cms", "create"), handleMediaUpload);
