import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import type { z } from "zod";
import type { activityLogFilterValidation } from "../../controllers/activity-log/activity-log.validation";
import { ActivityLogSubject, type ActivityLogEntity } from "../../entities/activity-log";
import { DepartmentEntity } from "../../entities/department";
import { UserEntity } from "../../entities/user";

/** Người xem log thấy được gì: toàn hệ thống, hoặc chỉ phòng ban của họ và các phòng con */
export interface ActivityLogScope {
  all: boolean;
  departmentId?: string | null;
}

/**
 * Id phòng ban của user và toàn bộ phòng ban con (mọi cấp). Phòng con xác định theo parentCode (path code, vd "a.b"),
 * cùng quy ước với DepartmentService.remove. Trả mảng rỗng nếu user không thuộc phòng nào hoặc phòng đã bị xóa.
 */
export async function departmentTreeIds(em: EntityManager, departmentId: string | null | undefined): Promise<string[]> {
  if (!departmentId) return [];

  const department = await em.findOne(
    DepartmentEntity,
    { id: departmentId, deleted: { $ne: true } },
    { fields: ["id", "code", "parentCode"] },
  );
  if (!department) return [];

  const ownPath = department.parentCode ? `${department.parentCode}.${department.code}` : department.code;
  const escapedOwnPath = ownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const descendants = await em.find(
    DepartmentEntity,
    { deleted: { $ne: true }, parentCode: { $re: `^${escapedOwnPath}(\\.|$)` } as never },
    { fields: ["id"] },
  );

  return [department.id, ...descendants.map((d) => d.id)];
}

type ActivityLogFilter = Pick<
  z.infer<typeof activityLogFilterValidation>,
  "action" | "type" | "parentType" | "parentId" | "actorId" | "from" | "to"
>;

/**
 * Điều kiện của danh sách log. Có quyền xem toàn hệ thống (`scope.all`) thì không giới hạn thêm, ngược lại giới hạn trong phòng ban
 * của người xem và các phòng con: log do user trong các phòng đó thực hiện, cộng log auth (parentType = auth) của user trong các phòng
 * đó (kể cả khi do hệ thống ghi). Trả null khi người xem không thuộc phòng nào (không thấy log nào).
 * Dùng chung cho danh sách và xuất Excel (worker nhận `scope` đã chốt lúc yêu cầu, không có quyền của người dùng).
 */
export async function buildActivityLogWhere(
  em: EntityManager,
  { action, type, parentType, parentId, actorId, from, to }: ActivityLogFilter,
  scope: ActivityLogScope,
): Promise<FilterQuery<ActivityLogEntity> | null> {
  const conditions: FilterQuery<ActivityLogEntity>[] = [{ deleted: { $ne: true } }];
  if (action) conditions.push({ action });
  if (type) conditions.push({ type });
  if (parentType) conditions.push({ parentType });
  if (parentId) conditions.push({ parentId });
  if (actorId) conditions.push({ createdBy: actorId });
  if (from) conditions.push({ createdAt: { $gte: from } });
  if (to) conditions.push({ createdAt: { $lte: to } });

  if (!scope.all) {
    const departmentIds = await departmentTreeIds(em, scope.departmentId);
    if (!departmentIds.length) return null;

    const members = await em.find(UserEntity, { department: { $in: departmentIds }, deleted: { $ne: true } }, { fields: ["id"] });
    conditions.push({
      $or: [
        { createdBy: { department: { $in: departmentIds } } },
        { parentType: ActivityLogSubject.Auth, parentId: { $in: members.map((m) => m.id) } },
      ],
    });
  }
  return { $and: conditions };
}
