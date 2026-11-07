import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import type { InboxFilterDto } from "../../controllers/approval-task/approval-task.validation";
import { type ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { actionableTaskFilter } from "../approval-engine/task-access";

/** Task đang chờ người dùng xử lý: họ giữ, của nhóm họ đang ở, hoặc họ được ủy quyền xử lý thay */
export async function pendingTaskWhere(em: EntityManager, userId: string): Promise<FilterQuery<ApprovalTaskEntity>> {
  const conditions = await actionableTaskFilter(em, userId);
  return { status: ApprovalTaskStatus.Pending, $or: conditions };
}

/**
 * Điều kiện của hộp chờ duyệt cho một người dùng. Dùng chung cho danh sách và xuất Excel. Hàm thuần: nhận `em` và `userId`,
 * không đọc gì từ request — worker xuất file chạy ngoài request vẫn dùng được.
 */
export async function buildInboxWhere(
  em: EntityManager,
  filter: Pick<InboxFilterDto, "tab" | "requestTypeId" | "search">,
  userId: string,
): Promise<FilterQuery<ApprovalTaskEntity>> {
  const { tab, requestTypeId, search } = filter;
  const pendingMine = await pendingTaskWhere(em, userId);
  const byTab: Record<typeof tab, FilterQuery<ApprovalTaskEntity>> = {
    pending: pendingMine,
    done: { actedBy: userId, status: { $ne: ApprovalTaskStatus.Pending } },
    all: { $or: [pendingMine, { approver: { user: userId } }, { actedBy: userId }] },
  };
  const requestWhere: Record<string, unknown> = { deleted: { $ne: true } };
  if (requestTypeId) requestWhere.requestType = requestTypeId;
  if (search) requestWhere.$or = [{ title: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];
  return { $and: [byTab[tab], { request: requestWhere }] };
}
