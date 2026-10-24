import { SIGNATURE_BOX, isValidSignatureSize } from "@core-service/services/e-signature";
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

export const placementSchema = z
  .object({
    page: z.number().int().min(1),
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  // Giữ tỉ lệ khung chuẩn, phóng trong khoảng cho phép (nhỏ quá chữ in ra không đọc được)
  .refine((placement) => isValidSignatureSize(placement.width, placement.height), {
    message: `Signature box must keep the ${SIGNATURE_BOX.width}x${SIGNATURE_BOX.height} ratio and be ${SIGNATURE_BOX.minScale}-${SIGNATURE_BOX.maxScale} times that size`,
  });

export const signApproveValidation = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
  comment: z.string().trim().max(2000).optional(),
  /** Vị trí chữ ký theo id văn bản (điểm PDF, gốc góc dưới-trái); thiếu thì tự xếp ở chân trang cuối */
  placements: z.record(z.string(), placementSchema).optional(),
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
