import { z } from "zod";

export const createUserValidation = z.object({
  loginName: z.string().trim().min(1, "Email is required").email("Invalid email format"),
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
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
  department: z.string().trim().optional(),
});
