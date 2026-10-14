import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import { ApprovalDelegationEntity, ApprovalDelegationMode } from "../../entities/approval-delegation";
import { type ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";

/**
 * Quyền xử lý thay theo ủy quyền. Task luôn thuộc người duyệt gốc (`approver`); người được ủy quyền chỉ được xử lý thay:
 * - Kiểu "trong thời gian" (window): ủy quyền đang hiệu lực ngay lúc xử lý, bước cho phép ủy quyền (`task.delegable`).
 * - Kiểu "giao phiếu" (handover): ủy quyền đã gắn vào task lúc task được tạo (`task.handoverDelegations`), chưa bị xóa.
 * Chung: đúng loại tờ trình, người được ủy quyền không phải người trình. Không chuyển tiếp (ủy quyền của người được ủy quyền).
 */

interface RequestScope {
  requesterId: string;
  requestTypeId: string;
}

const matchesType = (delegation: ApprovalDelegationEntity, requestTypeId: string) =>
  !delegation.requestType || delegation.requestType.id === requestTypeId;

/** Ủy quyền đang hiệu lực (lúc `at`) của các người ủy quyền, theo kiểu, khớp loại tờ trình */
export async function activeDelegationsFrom(
  em: EntityManager,
  fromUserIds: string[],
  mode: ApprovalDelegationMode,
  scope: RequestScope,
  at = new Date(),
) {
  if (!fromUserIds.length) return [];
  const rows = await em.find(ApprovalDelegationEntity, {
    fromUser: { $in: fromUserIds },
    mode,
    startAt: { $lte: at },
    endAt: { $gte: at },
    deleted: { $ne: true },
    $or: [{ requestType: null }, { requestType: scope.requestTypeId }],
  });
  return rows.filter((d) => matchesType(d, scope.requestTypeId) && d.toUser.id !== scope.requesterId);
}

/**
 * Người được xử lý thay từng task đang chờ (không gồm người duyệt gốc). Cần populate `handoverDelegations`.
 * Trả về taskId → danh sách userId.
 */
export async function resolveTaskDelegates(em: EntityManager, tasks: ApprovalTaskEntity[], scope: RequestScope) {
  const result = new Map<string, string[]>();
  const pending = tasks.filter((t) => t.status === ApprovalTaskStatus.Pending);
  if (!pending.length) return result;

  const windowRows = await activeDelegationsFrom(
    em,
    [...new Set(pending.filter((t) => t.delegable).map((t) => t.approver.id))],
    ApprovalDelegationMode.Window,
    scope,
  );
  for (const task of pending) {
    const ids = new Set<string>();
    if (task.delegable) {
      windowRows.filter((d) => d.fromUser.id === task.approver.id).forEach((d) => ids.add(d.toUser.id));
    }
    if (task.handoverDelegations.isInitialized()) {
      task.handoverDelegations
        .getItems()
        .filter((d) => !d.deleted && d.toUser.id !== scope.requesterId)
        .forEach((d) => ids.add(d.toUser.id));
    }
    ids.delete(task.approver.id);
    if (ids.size) result.set(task.id, [...ids]);
  }
  return result;
}

/** Người dùng có được xử lý task không: chính người duyệt, hoặc được ủy quyền xử lý thay */
export const canActOnTask = (task: ApprovalTaskEntity, userId: string, delegates: Map<string, string[]>) =>
  task.approver.id === userId || (delegates.get(task.id)?.includes(userId) ?? false);

/**
 * Các điều kiện (ghép bằng $or) lọc task mà người dùng được xử lý thay — dùng cho hộp chờ duyệt.
 * Luôn có điều kiện "giao phiếu"; thêm một điều kiện cho mỗi ủy quyền "trong thời gian" đang hiệu lực.
 */
export async function delegatedTaskFilter(em: EntityManager, userId: string): Promise<FilterQuery<ApprovalTaskEntity>[]> {
  const now = new Date();
  const windows = await em.find(ApprovalDelegationEntity, {
    toUser: userId,
    mode: ApprovalDelegationMode.Window,
    startAt: { $lte: now },
    endAt: { $gte: now },
    deleted: { $ne: true },
  });
  const notMine = { requester: { $ne: userId } };
  const conditions: FilterQuery<ApprovalTaskEntity>[] = windows.map((d) => ({
    approver: d.fromUser.id,
    delegable: true,
    request: d.requestType ? { ...notMine, requestType: d.requestType.id } : notMine,
  }));
  conditions.push({ handoverDelegations: { toUser: userId, deleted: { $ne: true } }, request: notMine });
  return conditions;
}
