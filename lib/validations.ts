import { z } from "zod";

// Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export const registerSchema = z
  .object({
    name: z.string().min(3, "Nama lengkap minimal 3 karakter").max(100),
    username: z
      .string()
      .min(3, "Username minimal 3 karakter")
      .max(50)
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username hanya boleh berisi huruf, angka, dan underscore"
      ),
    email: z.string().email("Email tidak valid").max(100),
    password: z
      .string()
      .min(6, "Password minimal 6 karakter")
      .max(12, "Password maksimal 12 karakter")
      .superRefine((val, ctx) => {
        if (!/[A-Z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password harus mengandung huruf besar",
          });
        }
        if (!/\d/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password harus mengandung angka",
          });
        }
        if (!/[a-z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password harus mengandung huruf kecil",
          });
        }
      }),
    confirmPassword: z.string(),
    phone: z
      .string()
      .regex(/^[0-9]{10,15}$/, "Nomor telepon tidak valid (10-15 digit)")
      .optional()
      .or(z.literal("")),
    provinceId: z.number().int().positive("Pilih provinsi").optional(),
    cityId: z.number().int().positive("Pilih kota/kabupaten").optional(),
    address: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password tidak cocok",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// Profile Update Schema (all optional, validate formats)
export const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(50)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username hanya boleh berisi huruf, angka, dan underscore"
    )
    .optional(),
  name: z.string().min(3, "Nama minimal 3 karakter").max(100).optional(),
  phone: z
    .string()
    .regex(/^[0-9]{10,15}$/, "Nomor telepon tidak valid (10-15 digit)")
    .optional()
    .or(z.literal("")),
  provinceId: z.number().int().positive().optional(),
  cityId: z.number().int().positive().optional(),
  address: z.string().max(500).optional().or(z.literal("")),
  image: z.string().url("URL gambar tidak valid").optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// Password Reset Schema
export const passwordResetSchema = z
  .object({
    oldPassword: z.string().min(6, "Password lama minimal 6 karakter"),
    newPassword: z
      .string()
      .min(6, "Password baru minimal 6 karakter")
      .max(12, "Password baru maksimal 12 karakter")
      .superRefine((val, ctx) => {
        if (!/[A-Z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password baru harus mengandung huruf besar",
          });
        }
        if (!/\d/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password baru harus mengandung angka",
          });
        }
        if (!/[a-z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password baru harus mengandung huruf kecil",
          });
        }
      }),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Konfirmasi password baru tidak cocok",
    path: ["confirmNewPassword"],
  });

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
