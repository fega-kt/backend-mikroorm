import { PrincipalEntity } from "@core-service/entities/principal";
import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import { ApprovalDelegationEntity, ApprovalDelegationMode } from "../../entities/approval-delegation";
import { type ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";

/**
 * Ai được xử lý một task — task giữ bởi một principal (`approver`):
 * - Principal người H: H, cộng người H ủy quyền
 *   · "trong thời gian" (window): ủy quyền đang hiệu lực ngay lúc xử lý, bước cho phép ủy quyền (`task.delegable`);
 *   · "giao phiếu" (handover): ủy quyền đã gắn vào task khi task về tay H (`task.handoverDelegations`), chưa bị xóa.
 * - Principal nhóm (nhóm "cùng xử lý"): thành viên hiện tại của nhóm. Chưa hỗ trợ ủy quyền cho nhóm.
 * Chung: đúng loại tờ trình, không xử lý đơn của chính mình. Không chuyển tiếp ủy quyền.
 *
 * Các hàm đọc `task.approver.user` → task phải được populate `approver`.
 */

interface RequestScope {
  requesterId: string;
  requestTypeId: string;
}

/** User đang giữ task (principal người), null nếu task đang giao cho nhóm */
export const holderUserId = (task: ApprovalTaskEntity) => task.approver?.user?.id ?? null;

/** Task đang giao cho cả nhóm (nhóm "cùng xử lý") */
export const isGroupTask = (task: ApprovalTaskEntity) => !!task.approver && !task.approver.user;

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
 * Người được xử lý thay từng task đang chờ do một người giữ (không gồm chính người giữ).
 * Cần populate `approver` và `handoverDelegations`. Trả về taskId → danh sách userId.
 */
export async function resolveTaskDelegates(em: EntityManager, tasks: ApprovalTaskEntity[], scope: RequestScope) {
  const result = new Map<string, string[]>();
  const held = tasks.filter((t) => t.status === ApprovalTaskStatus.Pending && holderUserId(t));
  if (!held.length) return result;

  const windowRows = await activeDelegationsFrom(
    em,
    [...new Set(held.filter((t) => t.delegable).map((t) => holderUserId(t)))],
    ApprovalDelegationMode.Window,
    scope,
  );
  for (const task of held) {
    const holder = holderUserId(task);
    const ids = new Set<string>();
    if (task.delegable) windowRows.filter((d) => d.fromUser.id === holder).forEach((d) => ids.add(d.toUser.id));
    if (task.handoverDelegations.isInitialized()) {
      task.handoverDelegations
        .getItems()
        .filter((d) => !d.deleted && d.toUser.id !== scope.requesterId)
        .forEach((d) => ids.add(d.toUser.id));
    }
    ids.delete(holder);
    if (ids.size) result.set(task.id, [...ids]);
  }
  return result;
}

/** Ngữ cảnh xét quyền của một người dùng trên các task của một đơn */
export interface TaskAccess {
  /** taskId → người được xử lý thay (từ resolveTaskDelegates) */
  delegates: Map<string, string[]>;
  /** Principal nhóm mà người dùng đang là thành viên */
  memberOf: Set<string>;
  requesterId: string;
}

/** Dựng ngữ cảnh quyền (populate approver + ủy quyền gắn task trước) */
export async function buildTaskAccess(
  em: EntityManager,
  tasks: ApprovalTaskEntity[],
  scope: RequestScope,
  userId: string,
): Promise<TaskAccess> {
  await em.populate(tasks, ["approver", "handoverDelegations"]);
  return {
    delegates: await resolveTaskDelegates(em, tasks, scope),
    memberOf: await memberGroupPrincipalIds(em, userId),
    requesterId: scope.requesterId,
  };
}

/** Người dùng có được xử lý task không (xem quy tắc đầu file) */
export function canActOnTask(task: ApprovalTaskEntity, userId: string, access: TaskAccess) {
  const holder = holderUserId(task);
  if (holder) return holder === userId || (access.delegates.get(task.id)?.includes(userId) ?? false);
  return !!task.approver && access.memberOf.has(task.approver.id) && userId !== access.requesterId;
}

/** Principal nhóm mà người dùng đang là thành viên */
export async function memberGroupPrincipalIds(em: EntityManager, userId: string) {
  const rows = await em.find(PrincipalEntity, { group: { users: userId }, deleted: { $ne: true } }, { fields: ["id"] });
  return new Set(rows.map((p) => p.id));
}

/**
 * Điều kiện (ghép bằng $or) lọc task mà người dùng xử lý được — dùng cho hộp chờ duyệt:
 * task tôi giữ, task của nhóm tôi đang ở (trừ đơn của tôi), task của người đang ủy quyền cho tôi.
 */
export async function actionableTaskFilter(em: EntityManager, userId: string): Promise<FilterQuery<ApprovalTaskEntity>[]> {
  const now = new Date();
  const notMine = { requester: { $ne: userId } };
  const [memberOf, windows] = await Promise.all([
    memberGroupPrincipalIds(em, userId),
    em.find(ApprovalDelegationEntity, {
      toUser: userId,
      mode: ApprovalDelegationMode.Window,
      startAt: { $lte: now },
      endAt: { $gte: now },
      deleted: { $ne: true },
    }),
  ]);
  const conditions: FilterQuery<ApprovalTaskEntity>[] = [{ approver: { user: userId } }];
  if (memberOf.size) conditions.push({ approver: { $in: [...memberOf] }, request: notMine });
  for (const d of windows) {
    conditions.push({
      approver: { user: d.fromUser.id },
      delegable: true,
      request: d.requestType ? { ...notMine, requestType: d.requestType.id } : notMine,
    });
  }
  conditions.push({ handoverDelegations: { toUser: userId, deleted: { $ne: true } }, request: notMine });
  return conditions;
}
