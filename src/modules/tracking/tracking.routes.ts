import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { trackingService } from "./tracking.service.js";
import {
  createProkerSchema,
  updateProkerSchema,
  assignCommitteeSchema,
  createMeetingSchema,
  logAttendanceSchema,
  prokerQuerySchema,
} from "./tracking.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const trackingRouter = new Hono<{ Variables: Variables }>();

trackingRouter.use("*", authMiddleware);

// 1. GET /api/tracking/prokers
trackingRouter.get("/prokers", rbacMiddleware("tracking", "read"), async (c) => {
  const query = prokerQuerySchema.parse(c.req.query());
  const result = await trackingService.getProkers(query);

  return c.json({
    success: true,
    message: "Daftar program kerja berhasil dimuat",
    data: result.prokers,
    meta: result.meta,
  });
});

// 2. POST /api/tracking/prokers
trackingRouter.post(
  "/prokers",
  rbacMiddleware("tracking", "create"),
  zValidator("json", createProkerSchema),
  async (c) => {
    const body = c.req.valid("json");
    const created = await trackingService.createProker(body);

    return c.json(
      {
        success: true,
        message: "Program kerja berhasil dibuat",
        data: created,
      },
      201
    );
  }
);

// 3. PATCH /api/tracking/prokers/:id
trackingRouter.patch(
  "/prokers/:id",
  rbacMiddleware("tracking", "update"),
  zValidator("json", updateProkerSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const updated = await trackingService.updateProker(id, body);

    return c.json({
      success: true,
      message: "Program kerja berhasil diperbarui",
      data: updated,
    });
  }
);

// 4. POST /api/tracking/prokers/:id/committees
trackingRouter.post(
  "/prokers/:id/committees",
  rbacMiddleware("tracking", "create"),
  zValidator("json", assignCommitteeSchema),
  async (c) => {
    const prokerId = c.req.param("id")!;
    const body = c.req.valid("json");
    const committee = await trackingService.assignCommittee(prokerId, body);

    return c.json(
      {
        success: true,
        message: "Kader berhasil ditugaskan ke kepanitiaan proker dan poin telah ditambahkan",
        data: committee,
      },
      201
    );
  }
);

// 5. POST /api/tracking/meetings
trackingRouter.post(
  "/meetings",
  rbacMiddleware("tracking", "create"),
  zValidator("json", createMeetingSchema),
  async (c) => {
    const body = c.req.valid("json");
    const created = await trackingService.createMeeting(body);

    return c.json(
      {
        success: true,
        message: "Sesi rapat berhasil dibuat",
        data: created,
      },
      201
    );
  }
);

// 6. GET /api/tracking/meetings/:id
trackingRouter.get("/meetings/:id", rbacMiddleware("tracking", "read"), async (c) => {
  const id = c.req.param("id")!;
  const data = await trackingService.getMeeting(id);

  return c.json({
    success: true,
    message: "Detail rapat dan daftar presensi berhasil dimuat",
    data,
  });
});

// 7. POST /api/tracking/meetings/:id/attendances
trackingRouter.post(
  "/meetings/:id/attendances",
  rbacMiddleware("tracking", "create"),
  zValidator("json", logAttendanceSchema),
  async (c) => {
    const meetingId = c.req.param("id")!;
    const body = c.req.valid("json");
    const results = await trackingService.logAttendances(meetingId, body);

    return c.json({
      success: true,
      message: "Presensi rapat dan penyesuaian skor berhasil dicatat",
      data: results,
    });
  }
);
