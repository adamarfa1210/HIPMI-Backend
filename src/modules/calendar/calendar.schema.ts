import { z } from "zod";

export const createCalendarEventSchema = z.object({
  prokerId: z.string().uuid().optional().nullable(),
  title: z
    .string()
    .min(3, "Judul agenda minimal 3 karakter")
    .max(140, "Judul agenda maksimal 140 karakter"),
  category: z.enum(
    [
      "PROKER",
      "INTERNAL_MEETING",
      "COMPETITION_DEADLINE",
      "ORGANIZATION_HOLIDAY",
    ],
    {
      errorMap: () => ({
        message:
          "Kategori harus PROKER, INTERNAL_MEETING, COMPETITION_DEADLINE, atau ORGANIZATION_HOLIDAY",
      }),
    }
  ),
  startAt: z.string().datetime({ message: "Format waktu mulai harus ISO datetime" }),
  endAt: z.string().datetime({ message: "Format waktu selesai harus ISO datetime" }),
  location: z
    .string()
    .min(2, "Lokasi minimal 2 karakter")
    .max(140, "Lokasi maksimal 140 karakter"),
  isPublic: z.boolean().default(false),
});

export const calendarFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z
    .enum([
      "PROKER",
      "INTERNAL_MEETING",
      "COMPETITION_DEADLINE",
      "ORGANIZATION_HOLIDAY",
    ])
    .optional(),
  isPublic: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type CalendarFilterInput = z.infer<typeof calendarFilterSchema>;
