import { z } from "zod";
import { workflowDefinitionSchema } from "../../services/approval-engine/definition.schema";

export const createApprovalWorkflowValidation = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  requestType: z.string().trim().min(1, "Request type is required"),
  department: z.string().trim().min(1).optional().nullable(),
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

export const updateApprovalWorkflowValidation = createApprovalWorkflowValidation.partial();

export const approvalWorkflowFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  requestTypeId: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().trim().optional(),
});

export const saveDraftValidation = z.object({
  definition: workflowDefinitionSchema,
});

export const validateDefinitionValidation = z.object({
  /** Bỏ trống → kiểm tra bản nháp đang lưu */
  definition: workflowDefinitionSchema.optional(),
});

export const simulateValidation = z.object({
  definition: workflowDefinitionSchema.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Bỏ trống → chạy thử với chính người đang thao tác làm người tạo đơn */
  requesterId: z.string().trim().optional(),
});

export type CreateApprovalWorkflowDto = z.infer<typeof createApprovalWorkflowValidation>;
export type UpdateApprovalWorkflowDto = z.infer<typeof updateApprovalWorkflowValidation>;
export type ApprovalWorkflowFilterDto = z.infer<typeof approvalWorkflowFilterValidation>;
export type SimulateDto = z.infer<typeof simulateValidation>;
