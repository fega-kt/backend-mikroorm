import { z } from "zod";
import { ApprovalRequestStatus } from "../../entities/approval-request";

export const createApprovalRequestValidation = z.object({
  requestType: z.string().trim().min(1, "Request type is required"),
  title: z.string().trim().min(1, "Title is required").max(255),
  payload: z.record(z.string(), z.unknown()).default({}),
  attachments: z.array(z.string().trim().min(1)).max(20).default([]),
  /** true → tạo xong gửi luôn */
  submit: z.boolean().default(false),
});

export const updateApprovalRequestValidation = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const approvalRequestFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ApprovalRequestStatus).optional(),
  /** Nhiều trạng thái, phân tách bằng dấu phẩy (vd: draft,returned) */
  statuses: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(z.enum(ApprovalRequestStatus)).optional()),
  requestTypeId: z.string().trim().optional(),
  requesterId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const cancelApprovalRequestValidation = z.object({
  comment: z.string().trim().max(2000).optional(),
});

export type CreateApprovalRequestDto = z.infer<typeof createApprovalRequestValidation>;
export type UpdateApprovalRequestDto = z.infer<typeof updateApprovalRequestValidation>;
export type ApprovalRequestFilterDto = z.infer<typeof approvalRequestFilterValidation>;
