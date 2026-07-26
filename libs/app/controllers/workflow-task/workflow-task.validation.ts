import { z } from "zod";
import { WorkflowTaskStatus } from "../../entities/workflow-task";

export const workflowTaskFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(WorkflowTaskStatus).optional(),
});
