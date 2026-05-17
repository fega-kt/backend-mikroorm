import { z } from "zod";
import { WorkflowSettingStatus } from "../entity/workflow-setting.entity";

export const createWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  category: z.string().trim().min(1, "Category is required"),
  status: z.nativeEnum(WorkflowSettingStatus).default(WorkflowSettingStatus.Draft),
  description: z.string().trim().max(1000).optional().nullable(),
  bpmnXml: z.string().trim().optional().nullable(),
});

export const updateWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().min(1).optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  bpmnXml: z.string().trim().optional().nullable(),
});

export const workflowSettingFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  search: z.string().trim().optional(),
});
