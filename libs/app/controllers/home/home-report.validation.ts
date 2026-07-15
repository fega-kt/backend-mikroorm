import { z } from "zod";

export const pieQueryValidation = z.object({
  by: z.union([z.string(), z.number()]).optional(),
});

export const lineBodyValidation = z.object({
  range: z.enum(["week", "month", "year"]),
});
