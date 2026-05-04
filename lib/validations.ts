import { z } from "zod";

// Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    name: z.string().min(3, "Full name must be at least 3 characters").max(100),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(50)
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores"
      ),
    email: z.string().email("Invalid email").max(100),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(12, "Password must be at most 12 characters")
      .superRefine((val, ctx) => {
        if (!/[A-Z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must include an uppercase letter",
          });
        }
        if (!/\d/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must include a number",
          });
        }
        if (!/[a-z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must include a lowercase letter",
          });
        }
      }),
    confirmPassword: z.string(),
    phone: z
      .string()
      .regex(/^[0-9]{10,15}$/, "Invalid phone number (10-15 digits)")
      .optional()
      .or(z.literal("")),
    provinceId: z.number().int().positive("Select a province").optional(),
    cityId: z.number().int().positive("Select a city/regency").optional(),
    address: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// Profile Update Schema (all optional, validate formats)
export const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .optional(),
  name: z.string().min(3, "Name must be at least 3 characters").max(100).optional(),
  phone: z
    .string()
    .regex(/^[0-9]{10,15}$/, "Invalid phone number (10-15 digits)")
    .optional()
    .or(z.literal("")),
  provinceId: z.number().int().positive().optional(),
  cityId: z.number().int().positive().optional(),
  address: z.string().max(500).optional().or(z.literal("")),
  image: z.string().url("Invalid image URL").optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// Password Reset Schema
export const passwordResetSchema = z
  .object({
    oldPassword: z.string().min(6, "Old password must be at least 6 characters"),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(12, "New password must be at most 12 characters")
      .superRefine((val, ctx) => {
        if (!/[A-Z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "New password must include an uppercase letter",
          });
        }
        if (!/\d/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "New password must include a number",
          });
        }
        if (!/[a-z]/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "New password must include a lowercase letter",
          });
        }
      }),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New password confirmation does not match",
    path: ["confirmNewPassword"],
  });

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
