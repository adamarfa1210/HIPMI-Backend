import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { calendarService } from "./calendar.service.js";
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarFilterSchema,
  toggleCalendarQrStatusSchema,
} from "./calendar.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import {
  rbacMiddleware,
  rbacAnyMiddleware,
} from "../../middlewares/rbac.middleware.js";

type Variables = {
  user: AuthUser;
};

export const calendarRouter = new Hono<{ Variables: Variables }>();
export const publicCalendarRouter = new Hono();

// Public Calendar Feed (No auth required)
publicCalendarRouter.get("/", async (c) => {
  const data = await calendarService.getPublicEvents();
  return c.json({
    success: true,
    message: "Kalender publik HIPMI berhasil dimuat",
    data,
  });
});

// Internal Calendar (Authenticated & RBAC protected)
calendarRouter.use("*", authMiddleware);

calendarRouter.get(
  "/roles",
  rbacAnyMiddleware([
    { moduleCode: "calendar", action: "read" },
    { moduleCode: "calendar", action: "create" },
    { moduleCode: "rbpl", action: "create" },
  ]),
  async (c) => {
    const data = await calendarService.listSelectableRoles();
    return c.json({
      success: true,
      data,
    });
  }
);

calendarRouter.get("/", rbacMiddleware("calendar", "read"), async (c) => {
  const query = calendarFilterSchema.parse(c.req.query());
  const user = c.get("user");
  const data = await calendarService.getEvents(query, user);

  return c.json({
    success: true,
    message: "Daftar agenda kalender berhasil dimuat",
    data,
  });
});

calendarRouter.get(
  "/:id/attendance",
  rbacMiddleware("calendar", "read"),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    const data = await calendarService.getEventAttendance(id, user);

    return c.json({
      success: true,
      message: "Daftar hadir agenda berhasil dimuat",
      data,
    });
  }
);

calendarRouter.patch(
  "/:id/qr-status",
  rbacMiddleware("calendar", "read"),
  zValidator("json", toggleCalendarQrStatusSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await calendarService.toggleQrStatus(id, body.isOpen, user);

    return c.json({
      success: true,
      message: data.qrIsOpen
        ? "QR absensi dibuka"
        : "QR absensi ditutup",
      data,
    });
  }
);

calendarRouter.post(
  "/",
  rbacAnyMiddleware([
    { moduleCode: "calendar", action: "create" },
    { moduleCode: "rbpl", action: "create" },
  ]),
  zValidator("json", createCalendarEventSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const created = await calendarService.createEvent(body, user);

    return c.json(
      {
        success: true,
        message: "Agenda kalender berhasil ditambahkan",
        data: created,
      },
      201
    );
  }
);

calendarRouter.patch(
  "/:id",
  rbacAnyMiddleware([
    { moduleCode: "calendar", action: "update" },
    { moduleCode: "calendar", action: "create" },
    { moduleCode: "rbpl", action: "update" },
    { moduleCode: "rbpl", action: "create" },
  ]),
  zValidator("json", updateCalendarEventSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const updated = await calendarService.updateEvent(id, body, user);

    return c.json({
      success: true,
      message: "Agenda kalender berhasil diperbarui",
      data: updated,
    });
  }
);

calendarRouter.delete(
  "/:id",
  rbacAnyMiddleware([
    { moduleCode: "calendar", action: "delete" },
    { moduleCode: "rbpl", action: "delete" },
  ]),
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user");
    await calendarService.deleteEvent(id, user);

    return c.json({
      success: true,
      message: "Agenda kalender berhasil dihapus",
    });
  }
);
