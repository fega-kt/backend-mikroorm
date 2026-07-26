import { z } from "zod";
import { ApprovalType, ApproverType, SelfApproval, WorkflowSettingStatus } from "../../entities/workflow-setting";

const approverConfigSchema = z.object({
  type: z.nativeEnum(ApproverType),
  id: z.string().optional(),
  name: z.string().optional(),
  // FE sends PrincipalEntity objects; transform to IDs for storage
  approvers: z.array(z.string().min(1)).optional(),
  fieldPath: z.string().optional(),
});

const wfApprovalDataSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  approvers: z.array(approverConfigSchema),
  approvalType: z.nativeEnum(ApprovalType),
  selfApproval: z.nativeEnum(SelfApproval),
});

// Keyed by the BPMN element id (bpmn:UserTask) it belongs to
const approvalConfigSchema = z.record(z.string(), wfApprovalDataSchema);

export const createWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  category: z.string().trim().min(1, "Category is required"),
  status: z.nativeEnum(WorkflowSettingStatus).default(WorkflowSettingStatus.Draft),
  description: z.string().trim().max(1000).optional().nullable(),
  approvalConfig: approvalConfigSchema.optional().nullable(),
});

export const updateWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().min(1).optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  approvalConfig: approvalConfigSchema.optional().nullable(),
});

export const deployWorkflowSettingValidation = z.object({
  processDefinitionKey: z.string().trim().min(1, "Process definition key is required"),
});

export const workflowSettingFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  search: z.string().trim().optional(),
});
