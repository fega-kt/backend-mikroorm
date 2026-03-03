import z from "zod";

export const createDepartmentValidation = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be less than 50 characters")
    .regex(/^[a-zA-Z]+$/, "Code must contain only letters (a-z, A-Z)"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Name must contain only letters and single spaces between words"),
  parentId: z.string().optional().nullable(),
});
