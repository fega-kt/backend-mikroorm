import { z } from "zod";

export const notificationListValidation = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  /** Cursor — id (uuidv7) của item cuối trang trước, lấy các noti cũ hơn */
  before: z.uuid().optional(),
  onlyUnread: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type NotificationListDto = z.infer<typeof notificationListValidation>;
