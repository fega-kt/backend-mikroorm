import { z } from "zod";
import { WorkflowInstanceStatus } from "../../entities/workflow-instance";

export const createWorkflowInstanceValidation = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  content: z.string().trim().optional().nullable(),
  requestType: z.string().trim().optional(),
  workflowSetting: z.string().trim().min(1, "Workflow setting is required"),
});

export const workflowInstanceFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(WorkflowInstanceStatus).optional(),
  search: z.string().trim().optional(),
});
