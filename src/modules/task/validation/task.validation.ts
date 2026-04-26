import { TaskPriority, TaskStatus } from "../entity/task.entity";
import { z } from "zod";

export const createTaskValidation = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().optional(),
  project: z.string().trim().min(1, "Project is required"),
  section: z.string().trim().optional(),
  sprint: z.string().trim().optional(),
  parentTask: z.string().trim().optional(),
  status: z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]).default(TaskStatus.TODO),
  priority: z.enum(Object.values(TaskPriority) as [TaskPriority, ...TaskPriority[]]),
  assignee: z.string().trim().min(1, "Assignee is required"),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().positive().optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
  order: z.number().int().min(0).optional(),
});

export const updateTaskValidation = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  section: z.string().trim().nullable().optional(),
  sprint: z.string().trim().nullable().optional(),
  parentTask: z.string().trim().nullable().optional(),
  status: z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]).optional(),
  priority: z.enum(Object.values(TaskPriority) as [TaskPriority, ...TaskPriority[]]).optional(),
  assignee: z.string().trim().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().positive().nullable().optional(),
  actualHours: z.number().positive().nullable().optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
  order: z.number().int().min(0).optional(),
});

export const reorderTasksValidation = z.object({
  orders: z.array(
    z.object({
      id: z.string().trim().min(1),
      order: z.number().int().min(0),
    })
  ).min(1),
});

export const moveTaskValidation = z.object({
  sectionId: z.string().trim().nullable(),
});

export const createSubTaskValidation = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
});

export const taskFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]).optional(),
  priority: z.enum(Object.values(TaskPriority) as [TaskPriority, ...TaskPriority[]]).optional(),
  assignee: z.string().trim().optional(),
  section: z.string().trim().optional(),
  sprint: z.string().trim().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  parentTask: z.string().trim().optional(),
});
