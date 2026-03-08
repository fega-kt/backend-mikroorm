import z from "zod";

export const createGroupValidation = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Name must contain only letters and single spaces between words"),
  users: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")).optional(),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

export const updateGroupValidation = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Name must contain only letters and single spaces between words"),
  users: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")).optional(),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});
