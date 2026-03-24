import { TaskPriority, TaskStatus } from "../entity/task.entity";
import { z } from "zod";

export const createTaskValidation = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().min(1, "Description is required"),
  project: z.string().trim().min(1, "Project is required"),
  status: z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]),
  priority: z.enum(Object.values(TaskPriority) as [TaskPriority, ...TaskPriority[]]),
  assignee: z.string().trim().min(1, "Assignee is required"),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  order: z.number().int().min(0).optional(),
});

export const updateTaskValidation = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  project: z.string().trim().optional(),
  status: z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]).optional(),
  priority: z.enum(Object.values(TaskPriority) as [TaskPriority, ...TaskPriority[]]).optional(),
  assignee: z.string().trim().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  order: z.number().int().min(0).optional(),
});
