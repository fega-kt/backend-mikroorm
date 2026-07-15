import { z } from "zod";

export const createCategoryValidation = z.object({
  department: z.string().trim().min(1, "Department is required"),
  code: z
    .string()
    .trim()
    .min(3, "Code must be at least 3 characters")
    .max(50)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, "Code must contain only letters and digits")),
  name: z.string().trim().min(1, "Name is required").max(255),
  icon: z.string().trim().pipe(z.url()).or(z.literal("")).optional().nullable(),
});

export const updateCategoryValidation = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Code must be at least 3 characters")
    .max(50)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, "Code must contain only letters and digits"))
    .optional(),
  department: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  icon: z.string().trim().pipe(z.url()).or(z.literal("")).optional().nullable(),
});

export const categoryFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  departmentId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});
