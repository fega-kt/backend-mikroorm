import { z } from "zod";
import { ActivityLogQueueStatus } from "../../entities/activity-log-queue";

export const activityLogQueueFilterValidation = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(ActivityLogQueueStatus).optional(),
});
