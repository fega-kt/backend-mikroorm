import { SprintStatus } from "../entity/sprint.entity";
import { z } from "zod";

export const createSprintValidation = z.object({
  project: z.string().trim().min(1, "Project is required"),
  name: z.string().trim().min(1, "Name is required").max(255),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.nativeEnum(SprintStatus).default(SprintStatus.PLANNING),
});

export const updateSprintValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.nativeEnum(SprintStatus).optional(),
});

export const sprintFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(SprintStatus).optional(),
});
