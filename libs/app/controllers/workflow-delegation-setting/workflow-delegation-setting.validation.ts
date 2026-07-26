import { z } from "zod";

export const createWorkflowDelegationSettingValidation = z.object({
  originalApprover: z.string().trim().min(1, "Original approver is required"),
  delegatedApprovers: z.array(z.string().min(1)).min(1, "At least one delegated approver is required"),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  requestTypes: z.array(z.string().min(1)).optional(),
  workflowSettings: z.array(z.string().min(1)).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const updateWorkflowDelegationSettingValidation = createWorkflowDelegationSettingValidation.partial();

export const workflowDelegationSettingFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  originalApprover: z.string().trim().optional(),
});
