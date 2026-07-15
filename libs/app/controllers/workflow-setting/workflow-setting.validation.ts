import { z } from "zod";
import {
  ApprovalType,
  ApproverType,
  ConditionOperator,
  SelfApproval,
  WfEndResult,
  WfNodeType,
  WorkflowSettingStatus,
} from "../../entities/workflow-setting";

const conditionRuleSchema = z.object({
  field: z.string().trim().min(1, "Field is required"),
  operator: z.nativeEnum(ConditionOperator),
  value: z.string(),
});

const wfEdgeConditionSchema = z.object({
  label: z.string().trim().min(1, "Condition label is required"),
  rules: z.array(conditionRuleSchema).min(1, "At least one rule is required"),
  logic: z.enum(["and", "or"]),
  isDefault: z.boolean().optional(),
});

const approverConfigSchema = z.object({
  type: z.nativeEnum(ApproverType),
  id: z.string().optional(),
  name: z.string().optional(),
  // FE sends PrincipalEntity objects; transform to IDs for storage
  approvers: z.array(z.string().min(1)).optional(),
  fieldPath: z.string().optional(),
});

const wfPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const wfStartDataSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
});

const wfApprovalDataSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  approvers: z.array(approverConfigSchema),
  approvalType: z.nativeEnum(ApprovalType),
  selfApproval: z.nativeEnum(SelfApproval),
});

const wfEndDataSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  result: z.nativeEnum(WfEndResult),
});

const wfNodeSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), type: z.literal(WfNodeType.Start), position: wfPositionSchema, data: wfStartDataSchema }),
  z.object({ id: z.string().min(1), type: z.literal(WfNodeType.Approval), position: wfPositionSchema, data: wfApprovalDataSchema }),
  z.object({ id: z.string().min(1), type: z.literal(WfNodeType.End), position: wfPositionSchema, data: wfEndDataSchema }),
]);

const wfEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1, "Source node is required"),
  target: z.string().min(1, "Target node is required"),
  condition: wfEdgeConditionSchema.optional(),
});

const workflowDefinitionSchema = z.object({
  nodes: z.array(wfNodeSchema).min(1, "At least one node is required"),
  edges: z.array(wfEdgeSchema),
});

export const createWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  category: z.string().trim().min(1, "Category is required"),
  status: z.nativeEnum(WorkflowSettingStatus).default(WorkflowSettingStatus.Draft),
  description: z.string().trim().max(1000).optional().nullable(),
  workflowDefinition: workflowDefinitionSchema.optional().nullable(),
});

export const updateWorkflowSettingValidation = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().min(1).optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  workflowDefinition: workflowDefinitionSchema.optional().nullable(),
});

export const workflowSettingFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().optional(),
  status: z.nativeEnum(WorkflowSettingStatus).optional(),
  search: z.string().trim().optional(),
});
