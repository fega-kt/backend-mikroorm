import type { FilterQuery } from "@mikro-orm/core";
import type { ApprovalRequestFilterDto } from "../../controllers/approval-request/approval-request.validation";
import type { ApprovalRequestEntity } from "../../entities/approval-request";

type RequestFilter = Pick<ApprovalRequestFilterDto, "status" | "statuses" | "requestTypeId" | "search">;

/** Phạm vi "của tôi": tờ trình do người dùng trình */
export const myRequestsScope = (userId: string): FilterQuery<ApprovalRequestEntity> => ({ requester: userId });

/** Phạm vi "tất cả" (quản trị): mọi tờ trình, hoặc của một người trình nếu có lọc */
export const allRequestsScope = (filter: Pick<ApprovalRequestFilterDto, "requesterId">): FilterQuery<ApprovalRequestEntity> =>
  filter.requesterId ? { requester: filter.requesterId } : {};

/**
 * Điều kiện của danh sách tờ trình: phạm vi + bộ lọc. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau
 * (xuất Excel mà lệch điều kiện là lộ dữ liệu). Hàm thuần — nhận userId, không đọc người dùng từ request.
 */
export function buildRequestListWhere(
  scope: FilterQuery<ApprovalRequestEntity>,
  filter: RequestFilter,
): FilterQuery<ApprovalRequestEntity> {
  const { status, statuses, requestTypeId, search } = filter;
  const where: FilterQuery<ApprovalRequestEntity> = { ...(scope as object), deleted: { $ne: true } };
  if (status) where.status = status;
  else if (statuses?.length) where.status = { $in: statuses };
  if (requestTypeId) where.requestType = requestTypeId;
  if (search) where.$or = [{ title: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];
  return where;
}
