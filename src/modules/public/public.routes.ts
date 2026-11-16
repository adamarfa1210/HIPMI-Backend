import { Hono } from "hono";
import { PublicService } from "./public.service.js";

export const publicRouter = new Hono();

// All public endpoints are open (unauthenticated)

publicRouter.get("/home", async (c) => {
  const data = await PublicService.getHomeData();
  return c.json({
    success: true,
    message: "Data beranda berhasil diambil",
    data,
  });
});

publicRouter.get("/partners", async (c) => {
  const category = c.req.query("category");
  const data = await PublicService.getPartners(category);
  return c.json({
    success: true,
    message: "Data kemitraan berhasil diambil",
    data,
  });
});

publicRouter.get("/kader-businesses", async (c) => {
  const sector = c.req.query("sector");
  const data = await PublicService.getKaderBusinesses(sector);
  return c.json({
    success: true,
    message: "Data bisnis kader berhasil diambil",
    data,
  });
});

publicRouter.get("/achievements", async (c) => {
  const category = c.req.query("category");
  const data = await PublicService.getAchievements(category);
  return c.json({
    success: true,
    message: "Data prestasi berhasil diambil",
    data,
  });
});

publicRouter.get("/program-kerja", async (c) => {
  const data = await PublicService.getAllProgramKerja();
  return c.json({
    success: true,
    message: "Data seluruh bidang program kerja berhasil diambil",
    data,
  });
});

publicRouter.get("/program-kerja/:bidang", async (c) => {
  const bidang = c.req.param("bidang") as "okk" | "medkominfo" | "eksternal" | "ekraf";
  const data = await PublicService.getProgramKerjaByBidang(bidang);
  return c.json({
    success: true,
    message: `Data program kerja bidang ${bidang.toUpperCase()} berhasil diambil`,
    data,
  });
});

publicRouter.get("/testimonials", async (c) => {
  const category = c.req.query("category");
  const data = await PublicService.getTestimonials(category);
  return c.json({
    success: true,
    message: "Data testimoni berhasil diambil",
    data,
  });
});

publicRouter.get("/site-config", async (c) => {
  const data = await PublicService.getSiteConfig();
  return c.json({
    success: true,
    message: "Konfigurasi publik situs berhasil diambil",
    data,
  });
});
