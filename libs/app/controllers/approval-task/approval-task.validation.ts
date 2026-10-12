import { z } from "zod";

export const inboxFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** pending: đang chờ tôi duyệt; done: tôi đã xử lý; all: mọi lượt duyệt giao cho / do tôi xử lý */
  tab: z.enum(["pending", "done", "all"]).default("pending"),
  requestTypeId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const actionValidation = z.object({
  comment: z.string().trim().max(2000).optional(),
});

export const bulkApproveValidation = z.object({
  requestIds: z.array(z.string().trim().min(1)).min(1).max(100),
  comment: z.string().trim().max(2000).optional(),
});

export const reassignValidation = z.object({
  userId: z.string().trim().min(1),
  comment: z.string().trim().max(2000).optional(),
});

export type InboxFilterDto = z.infer<typeof inboxFilterValidation>;
