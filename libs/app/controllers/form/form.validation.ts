import { z } from "zod";
import { formSchemaSchema } from "../../services/approval-engine/form-schema";

export const createFormValidation = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must contain only uppercase letters, digits and underscores")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  formSchema: formSchemaSchema.optional().nullable(),
});

export const updateFormValidation = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  formSchema: formSchemaSchema.optional().nullable(),
});

export const formFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});
