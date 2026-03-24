import { z } from "zod";

export const createProjectValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional(),
  owner: z.string().trim().min(1, "Owner is required"),
  startDate: z.coerce.date(),
  dueDate: z.coerce.date(),
});

export const updateProjectValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  owner: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
});
