import { z } from "zod";

export const createProkerSchema = z.object({
  bidang: z.enum(["OKK", "MEDKOMINFO", "EKSTERNAL", "EKRAF"], {
    errorMap: () => ({
      message: "Bidang harus salah satu dari: OKK, MEDKOMINFO, EKSTERNAL, EKRAF",
    }),
  }),
  title: z
    .string()
    .min(3, "Judul proker minimal 3 karakter")
    .max(120, "Judul proker maksimal 120 karakter"),
  picKaderId: z.string().uuid("PIC Kader ID harus berupa UUID valid"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai harus YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai harus YYYY-MM-DD"),
  status: z
    .enum(["PLANNED", "ON_PROGRESS", "COMPLETED"])
    .default("PLANNED"),
});

export const updateProkerSchema = z.object({
  bidang: z.enum(["OKK", "MEDKOMINFO", "EKSTERNAL", "EKRAF"]).optional(),
  title: z.string().min(3).max(120).optional(),
  picKaderId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["PLANNED", "ON_PROGRESS", "COMPLETED"]).optional(),
});

export const assignCommitteeSchema = z.object({
  kaderId: z.string().uuid("Kader ID harus berupa UUID valid"),
  committeeRole: z
    .string()
    .min(2, "Peran kepanitiaan minimal 2 karakter")
    .max(60, "Peran kepanitiaan maksimal 60 karakter"),
  pointsAwarded: z.number().int().positive().default(20),
});

export const createMeetingSchema = z.object({
  prokerId: z.string().uuid().optional().nullable(),
  title: z
    .string()
    .min(3, "Judul rapat minimal 3 karakter")
    .max(120, "Judul rapat maksimal 120 karakter"),
  meetingDate: z.string(),
  pointsPerAttendance: z.number().int().positive().default(5),
});

export const logAttendanceItemSchema = z.object({
  kaderId: z.string().uuid("Kader ID harus berupa UUID valid"),
  status: z.enum(["HADIR", "IZIN", "SAKIT", "ALPHA"], {
    errorMap: () => ({
      message: "Status presensi harus HADIR, IZIN, SAKIT, atau ALPHA",
    }),
  }),
  pointsAwarded: z.number().int().optional(),
});

export const logAttendanceSchema = z.object({
  attendances: z
    .array(logAttendanceItemSchema)
    .min(1, "Minimal satu presensi harus diinput"),
});

export const prokerQuerySchema = z.object({
  bidang: z.enum(["OKK", "MEDKOMINFO", "EKSTERNAL", "EKRAF"]).optional(),
  status: z.enum(["PLANNED", "ON_PROGRESS", "COMPLETED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateProkerInput = z.infer<typeof createProkerSchema>;
export type UpdateProkerInput = z.infer<typeof updateProkerSchema>;
export type AssignCommitteeInput = z.infer<typeof assignCommitteeSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type LogAttendanceInput = z.infer<typeof logAttendanceSchema>;
export type ProkerQueryInput = z.infer<typeof prokerQuerySchema>;
