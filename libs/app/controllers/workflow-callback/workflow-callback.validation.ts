import { z } from "zod";

export const workflowFinalizeValidation = z.object({
  businessKey: z.string().trim().min(1, "Business key is required"),
  decision: z.enum(["APPROVE", "REJECT", "RETURN"]),
});

export const workflowTaskCreatedValidation = z.object({
  processInstanceId: z.string().trim().min(1, "Process instance id is required"),
  taskId: z.string().trim().min(1, "Task id is required"),
  taskDefinitionKey: z.string().trim().optional().default(""),
  assignee: z.string().trim().optional().default(""),
});
