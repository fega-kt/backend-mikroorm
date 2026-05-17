import { z } from "zod";

export const listFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z
    .string()
    .trim()
    .transform((val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .optional(),
});

export type ListFilterDto = z.infer<typeof listFilterValidation>;
