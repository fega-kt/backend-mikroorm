import { z } from "zod";
import { RequestFileCategory } from "../../services/approval-request/request-file.constants";
import { ApprovalPriority, ApprovalRequestStatus } from "../../entities/approval-request";

const fileIds = z.array(z.string().trim().min(1)).max(50);

export const createApprovalRequestValidation = z.object({
  /** Id do client sinh sẵn: để tệp upload trước khi tạo phiếu nằm đúng thư mục Attachments/{id}/... */
  id: z.uuid().optional(),
  requestType: z.string().trim().min(1, "Request type is required"),
  title: z.string().trim().min(1, "Title is required").max(255),
  payload: z.record(z.string(), z.unknown()).default({}),
  priority: z.enum(ApprovalPriority).default(ApprovalPriority.Normal),
  /** Đơn vị trình — phòng của người tạo hoặc phòng cấp trên; bỏ trống → phòng của người tạo */
  department: z.string().trim().min(1).optional(),
  /** Văn bản tờ trình */
  documents: fileIds.default([]),
  /** Tài liệu đính kèm */
  attachments: fileIds.default([]),
  /** true → tạo xong gửi luôn */
  submit: z.boolean().default(false),
});

export const updateApprovalRequestValidation = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(ApprovalPriority).optional(),
  department: z.string().trim().min(1).optional(),
  documents: fileIds.optional(),
  attachments: fileIds.optional(),
});

/** Xem trước luồng phê duyệt ở màn tạo tờ trình */
export const previewFlowValidation = z.object({
  requestType: z.string().trim().min(1),
  department: z.string().trim().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
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
export type PreviewFlowDto = z.infer<typeof previewFlowValidation>;
export type ApprovalRequestFilterDto = z.infer<typeof approvalRequestFilterValidation>;

export const presignRequestFileValidation = z.object({
  category: z.enum(RequestFileCategory),
  filename: z.string().trim().min(1).max(255),
  mimetype: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});
export type PresignRequestFileDto = z.infer<typeof presignRequestFileValidation>;

export const fileUrlQueryValidation = z.object({
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});
