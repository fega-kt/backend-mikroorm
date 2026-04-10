import { z } from "zod";

export const createSectionValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const updateSectionValidation = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

export const reorderSectionsValidation = z.object({
  orders: z.array(
    z.object({
      id: z.string().trim().min(1),
      order: z.number().int().min(0),
    })
  ).min(1),
});
