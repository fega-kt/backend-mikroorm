import { z } from "zod";
import { ApprovalDelegationMode } from "../../entities/approval-delegation";

const delegationShape = z.object({
  /** Người ủy quyền — bỏ trống = chính mình; người khác chỉ khi có quyền quản lý ủy quyền */
  fromUser: z.string().trim().min(1).optional().nullable(),
  toUser: z.string().trim().min(1, "Delegate is required"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  mode: z.enum(ApprovalDelegationMode).default(ApprovalDelegationMode.Window),
  requestType: z.string().trim().min(1).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

const endAfterStart = (v: { startAt?: Date; endAt?: Date }) => !v.startAt || !v.endAt || v.endAt > v.startAt;

export const createApprovalDelegationValidation = delegationShape.refine(endAfterStart, {
  message: "End time must be after start time",
  path: ["endAt"],
});

// Không đổi người ủy quyền / người được ủy quyền / kiểu ủy quyền sau khi tạo (task đã giao theo ủy quyền trỏ tới bản ghi này;
// đổi kiểu giữa chừng làm quyền trên phiếu đã giao khó lường)
export const updateApprovalDelegationValidation = delegationShape
  .omit({ fromUser: true, toUser: true, mode: true })
  .partial()
  .refine(endAfterStart, {
    message: "End time must be after start time",
    path: ["endAt"],
  });

export const approvalDelegationFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** mine: tôi ủy quyền cho người khác; toMe: người khác ủy quyền cho tôi; all: mọi ủy quyền (cần quyền quản lý) */
  tab: z.enum(["mine", "toMe", "all"]).default("mine"),
  activeOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateApprovalDelegationDto = z.infer<typeof createApprovalDelegationValidation>;
export type UpdateApprovalDelegationDto = z.infer<typeof updateApprovalDelegationValidation>;
export type ApprovalDelegationFilterDto = z.infer<typeof approvalDelegationFilterValidation>;
