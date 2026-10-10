import { z } from "zod";
import { ActivityLogAction, ActivityLogType } from "../../entities/activity-log";

export const activityLogFilterValidation = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  action: z.nativeEnum(ActivityLogAction).optional(),
  type: z.nativeEnum(ActivityLogType).optional(),
  parentType: z.string().optional(),
  parentId: z.string().optional(),
  /** user thực hiện (createdBy) */
  actorId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
