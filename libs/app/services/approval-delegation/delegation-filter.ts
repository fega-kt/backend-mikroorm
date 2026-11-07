import type { FilterQuery } from "@mikro-orm/core";
import { ForbiddenException } from "@nestjs/common";
import type { ApprovalDelegationFilterDto } from "../../controllers/approval-delegation/approval-delegation.validation";
import type { ApprovalDelegationEntity } from "../../entities/approval-delegation";

/**
 * Điều kiện của danh sách ủy quyền cho một người dùng. Tab "all" cần quyền quản lý (`canManage`), không thì ném Forbidden.
 * Dùng chung cho danh sách và xuất Excel (nhận userId, không đọc người dùng từ request).
 */
export function buildDelegationWhere(
  filter: Pick<ApprovalDelegationFilterDto, "tab" | "activeOnly">,
  userId: string,
  canManage: boolean,
): FilterQuery<ApprovalDelegationEntity> {
  const where: FilterQuery<ApprovalDelegationEntity> = { deleted: { $ne: true } };
  if (filter.tab === "all") {
    if (!canManage) throw new ForbiddenException("You cannot view all delegations");
  } else if (filter.tab === "mine") where.fromUser = userId;
  else where.toUser = userId;
  if (filter.activeOnly) where.endAt = { $gte: new Date() };
  return where;
}
