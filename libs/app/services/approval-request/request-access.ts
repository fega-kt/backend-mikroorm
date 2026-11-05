import type { EntityManager } from "@mikro-orm/core";
import { ApprovalShareEntity } from "../../entities/approval-share";
import type { ApprovalTaskEntity } from "../../entities/approval-task";
import { canActOnTask, holderUserId, type TaskAccess } from "../approval-engine/task-access";

/** Người tham gia: người giữ / người duyệt theo quy trình / người đã xử lý, hoặc đang xử lý được (ủy quyền, thành viên nhóm) */
export function isRequestParticipant(tasks: ApprovalTaskEntity[], userId: string, access: TaskAccess) {
  return tasks.some(
    (t) => [holderUserId(t), t.originApprover?.user?.id, t.actedBy?.id].includes(userId) || canActOnTask(t, userId, access),
  );
}

/** Phiếu đã được chia sẻ cho người dùng — trực tiếp hoặc qua nhóm họ đang là thành viên */
export async function isRequestSharedWith(em: EntityManager, requestId: string, userId: string, access: TaskAccess) {
  const count = await em.count(ApprovalShareEntity, {
    request: requestId,
    deleted: { $ne: true },
    $or: [{ principal: { user: userId } }, { principal: { $in: [...access.memberOf] } }],
  });
  return count > 0;
}
