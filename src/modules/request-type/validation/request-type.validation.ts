import { z } from "zod";
import { RequestTypeStatus } from "../entity/request-type.entity";

export const createRequestTypeValidation = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must contain only uppercase letters, digits and underscores")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(255),
  categoryId: z.string().trim().min(1, "Category is required"),
  prefix: z.string().trim().min(1, "Prefix is required").max(20),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.nativeEnum(RequestTypeStatus).optional(),
});

export const updateRequestTypeValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  categoryId: z.string().trim().min(1).optional(),
  prefix: z.string().trim().min(1).max(20).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.nativeEnum(RequestTypeStatus).optional(),
});

export const requestTypeFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().trim().optional(),
  status: z.nativeEnum(RequestTypeStatus).optional(),
  search: z.string().trim().optional(),
});
