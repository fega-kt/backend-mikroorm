import { MilestoneStatus } from "../entity/milestone.entity";
import { z } from "zod";

export const createMilestoneValidation = z.object({
  project: z.string().trim().min(1, "Project is required"),
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional(),
  dueDate: z.coerce.date(),
  status: z.nativeEnum(MilestoneStatus).default(MilestoneStatus.PENDING),
});

export const updateMilestoneValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  dueDate: z.coerce.date().optional(),
  status: z.nativeEnum(MilestoneStatus).optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

export const milestoneFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(MilestoneStatus).optional(),
});
