import { z } from "zod";

const delegationShape = z.object({
  toUser: z.string().trim().min(1, "Delegate is required"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  requestType: z.string().trim().min(1).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

const endAfterStart = (v: { startAt?: Date; endAt?: Date }) => !v.startAt || !v.endAt || v.endAt > v.startAt;

export const createApprovalDelegationValidation = delegationShape.refine(endAfterStart, {
  message: "End time must be after start time",
  path: ["endAt"],
});

export const updateApprovalDelegationValidation = delegationShape.partial().refine(endAfterStart, {
  message: "End time must be after start time",
  path: ["endAt"],
});

export const approvalDelegationFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** mine: tôi ủy quyền cho người khác; toMe: người khác ủy quyền cho tôi */
  tab: z.enum(["mine", "toMe"]).default("mine"),
  activeOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateApprovalDelegationDto = z.infer<typeof createApprovalDelegationValidation>;
export type UpdateApprovalDelegationDto = z.infer<typeof updateApprovalDelegationValidation>;
export type ApprovalDelegationFilterDto = z.infer<typeof approvalDelegationFilterValidation>;
