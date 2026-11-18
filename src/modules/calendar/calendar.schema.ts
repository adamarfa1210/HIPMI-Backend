import { z } from "zod";

export const CALENDAR_CATEGORY_VALUES = [
  "PROKER",
  "INTERNAL_MEETING",
  "RBPL",
  "COMPETITION_DEADLINE",
  "ORGANIZATION_HOLIDAY",
] as const;

export const createCalendarEventSchema = z.object({
  prokerId: z.string().uuid().optional().nullable(),
  title: z
    .string()
    .min(3, "Judul agenda minimal 3 karakter")
    .max(140, "Judul agenda maksimal 140 karakter"),
  category: z.enum(CALENDAR_CATEGORY_VALUES, {
    errorMap: () => ({
      message:
        "Kategori harus PROKER, INTERNAL_MEETING, RBPL, COMPETITION_DEADLINE, atau ORGANIZATION_HOLIDAY",
    }),
  }),
  startAt: z.string().datetime({ message: "Format waktu mulai harus ISO datetime" }),
  endAt: z.string().datetime({ message: "Format waktu selesai harus ISO datetime" }),
  location: z
    .string()
    .min(2, "Lokasi minimal 2 karakter")
    .max(140, "Lokasi maksimal 140 karakter"),
  isPublic: z.boolean().default(false),
  enableQrAttendance: z.boolean().optional().default(false),
  pointsPerAttendance: z.coerce
    .number()
    .int()
    .min(0, "Poin minimal 0")
    .max(500, "Poin maksimal 500")
    .optional()
    .default(5),
  targetRoleIds: z.array(z.string().uuid()).optional().default([]),
  qrIsOpen: z.boolean().optional(),
});

export const calendarFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.enum(CALENDAR_CATEGORY_VALUES).optional(),
  isPublic: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export const toggleCalendarQrStatusSchema = z.object({
  isOpen: z.boolean(),
});

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type CalendarFilterInput = z.infer<typeof calendarFilterSchema>;
export type ToggleCalendarQrStatusInput = z.infer<typeof toggleCalendarQrStatusSchema>;
