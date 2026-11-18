import { z } from "zod";

export const loginSchema = z.object({
  nim: z.string().min(1, "NIM wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Password lama wajib diisi"),
  newPassword: z.string().min(6, "Password baru minimal 6 karakter").max(100),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  nim: z.string().trim().min(5, "NIM minimal 5 karakter").max(20, "NIM maksimal 20 karakter"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const completeOnboardingSchema = z.object({
  newPassword: z
    .string()
    .min(6, "Password baru minimal 6 karakter")
    .max(100, "Password baru maksimal 100 karakter"),
  fullName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter").max(120).optional(),
  whatsappNumber: z.string().trim().min(8, "Nomor WhatsApp minimal 8 karakter").max(20).optional(),
  prodi: z.string().trim().min(2, "Prodi minimal 2 karakter").max(80).optional(),
  fakultas: z.string().trim().min(2, "Fakultas minimal 2 karakter").max(80).optional(),
  instagram: z.string().trim().max(60).optional(),
  businessName: z.string().trim().max(120).optional(),
  interestCategory: z
    .enum([
      "Kompetisi",
      "Punya Bisnis",
      "Belum Punya Bisnis",
      "Belum Punya Bisnis tapi Minat Kompetisi",
    ])
    .optional(),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
