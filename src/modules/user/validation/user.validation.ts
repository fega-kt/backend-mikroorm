import { listFilterValidation } from "@common/pagination/pagination.validation";
import { z } from "zod";

export const userListFilterValidation = listFilterValidation.extend({
  phoneNumber: z
    .string()
    .trim()
    .transform((val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type UserListFilterDto = z.infer<typeof userListFilterValidation>;

export const createUserValidation = z.object({
  loginName: z.string().trim().min(1, "Email is required").email("Invalid email format"),
  workEmail: z.string().trim().email("Invalid email format").optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+ ]+$/, "Invalid phone number format")
    .optional(),
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  avatar: z.string().trim().optional(),
  department: z.string().trim().optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(16, "Password must be at most 16 characters")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  isActive: z.boolean().default(true).optional(),
});

export const updateUserValidation = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  workEmail: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .pipe(z.email("Invalid email format").nullable()),
    ])
    .optional(),
  avatar: z.string().trim().optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+ ]+$/, "Invalid phone number format")
    .optional(),
  description: z.string().trim().max(1000).optional(),
  department: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

export const updateProfileValidation = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  workEmail: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .pipe(z.email("Invalid email format").nullable()),
    ])
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+ ]+$/, "Invalid phone number format")
    .optional(),
  description: z.string().trim().max(1000).optional(),
});
