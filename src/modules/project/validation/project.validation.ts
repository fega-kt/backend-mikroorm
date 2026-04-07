import { ProjectPriority, ProjectVisibility } from "@modules/project/entity/project.entity";
import { z } from "zod";

export const createProjectValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional(),
  priority: z.nativeEnum(ProjectPriority),
  visibility: z.nativeEnum(ProjectVisibility),
  owner: z.string().trim().min(1, "Owner is required"),
  startDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  budget: z.number().positive().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  folderId: z.string().check(z.uuid()),
  attachments: z.array(z.string().trim().min(1)).default([]),
});

export const updateProjectValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  visibility: z.nativeEnum(ProjectVisibility).optional(),
  owner: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  folderId: z.string().check(z.uuid()).optional(),
  attachments: z.array(z.string().trim().min(1)).default([]),
});
