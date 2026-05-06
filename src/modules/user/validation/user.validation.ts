import { z } from "zod";

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
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .optional(),
  isActive: z.boolean().default(true).optional(),
});

export const updateUserValidation = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words")
    .optional(),
  workEmail: z.string().trim().email("Invalid email format").optional(),
  avatar: z.string().trim().optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+ ]+$/, "Invalid phone number format")
    .optional(),
  description: z.string().trim().max(1000).optional(),
  department: z.string().trim().optional(),
});
