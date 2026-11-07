import type { FilterQuery } from "@mikro-orm/core";
import type { ActivityLogQueueEntity, ActivityLogQueueStatus } from "../../entities/activity-log-queue";
import type { NotificationType } from "../../entities/notification";

export interface ActivityLogQueueWhereInput {
  status?: ActivityLogQueueStatus;
  type?: NotificationType;
  refId?: string;
  keyword?: string;
}

/** Điều kiện của hàng đợi gửi mail. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau. */
export function buildActivityLogQueueWhere(filter: ActivityLogQueueWhereInput): FilterQuery<ActivityLogQueueEntity> {
  const where: FilterQuery<ActivityLogQueueEntity> = { deleted: { $ne: true } };
  if (filter.status) where.status = filter.status;
  if (filter.type) where.type = filter.type;
  if (filter.refId) where.refId = filter.refId;
  if (filter.keyword) {
    const like = `%${filter.keyword.replace(/[%_\\]/g, "\\$&")}%`;
    where.$or = [{ recipient: { $ilike: like } }, { subject: { $ilike: like } }];
  }
  return where;
}
