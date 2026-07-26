import { z } from "zod";

export const workflowActionValidation = z.object({
  workflowTaskId: z.string().trim().min(1, "Workflow task is required"),
  comment: z.string().trim().max(2000).optional(),
});

export const cancelWorkflowValidation = z.object({
  workflowInstanceId: z.string().trim().min(1, "Workflow instance is required"),
  comment: z.string().trim().max(2000).optional(),
});

export const requestReviewValidation = z.object({
  workflowTaskId: z.string().trim().min(1, "Workflow task is required"),
  reviewerPrincipalIds: z.array(z.string().min(1)).min(1, "At least one reviewer is required"),
  comment: z.string().trim().max(2000).optional(),
});

export const requestToCancelValidation = z.object({
  workflowInstanceId: z.string().trim().min(1, "Workflow instance is required"),
  approverPrincipalIds: z.array(z.string().min(1)).min(1, "At least one cancellation approver is required"),
  comment: z.string().trim().max(2000).optional(),
});
