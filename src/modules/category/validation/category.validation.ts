import { z } from "zod";

export const createCategoryValidation = z.object({
  departmentId: z.string().trim().min(1, "Department is required"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must contain only uppercase letters, digits and underscores")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(255),
  icon: z.string().trim().url("Icon must be a valid URL").optional().nullable(),
});

export const updateCategoryValidation = z.object({
  departmentId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  icon: z.string().trim().url("Icon must be a valid URL").optional().nullable(),
});

export const categoryFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  departmentId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});
