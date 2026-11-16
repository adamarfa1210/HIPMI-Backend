import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { calendarService } from "./calendar.service.js";
import {
  createCalendarEventSchema,
  calendarFilterSchema,
} from "./calendar.schema.js";
import { authMiddleware, type AuthUser } from "../../middlewares/auth.middleware.js";
import { rbacMiddleware } from "../../middlewares/rbac.middleware.js";

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

calendarRouter.get("/", rbacMiddleware("calendar", "read"), async (c) => {
  const query = calendarFilterSchema.parse(c.req.query());
  const data = await calendarService.getEvents(query);

  return c.json({
    success: true,
    message: "Daftar agenda kalender berhasil dimuat",
    data,
  });
});

calendarRouter.post(
  "/",
  rbacMiddleware("calendar", "create"),
  zValidator("json", createCalendarEventSchema),
  async (c) => {
    const body = c.req.valid("json");
    const created = await calendarService.createEvent(body);

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
