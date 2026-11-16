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
