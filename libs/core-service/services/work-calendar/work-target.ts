import { type EntityManager } from "@mikro-orm/core";
import { BadRequestException } from "@nestjs/common";
import { type WorkTargetDto } from "../../controllers/work-calendar/work-calendar.validation";
import { DepartmentEntity } from "../../entities/department";
import { UserEntity } from "../../entities/user";
import { WorkTargetType } from "../../entities/work-schedule-assignment";

/** Điều kiện lọc bản ghi (gán lịch / ngày đặc biệt) của đúng một đối tượng */
export function targetWhere(target: WorkTargetDto): { targetType: WorkTargetType; department?: string; user?: string } {
  if (target.targetType === WorkTargetType.Department) return { targetType: target.targetType, department: target.departmentId };
  if (target.targetType === WorkTargetType.User) return { targetType: target.targetType, user: target.userId };
  return { targetType: WorkTargetType.Company };
}

/** Cột đối tượng khi tạo bản ghi (bỏ id thừa không đúng loại) */
export function targetData(em: EntityManager, target: WorkTargetDto) {
  return {
    targetType: target.targetType,
    department:
      target.targetType === WorkTargetType.Department && target.departmentId
        ? em.getReference(DepartmentEntity, target.departmentId)
        : undefined,
    user: target.targetType === WorkTargetType.User && target.userId ? em.getReference(UserEntity, target.userId) : undefined,
  };
}

export async function assertTarget(em: EntityManager, target: WorkTargetDto): Promise<void> {
  if (target.targetType === WorkTargetType.Department) {
    if (!(await em.count(DepartmentEntity, { id: target.departmentId, deleted: false }))) {
      throw new BadRequestException("Department not found");
    }
  } else if (target.targetType === WorkTargetType.User) {
    if (!(await em.count(UserEntity, { id: target.userId, deleted: false }))) throw new BadRequestException("User not found");
  }
}
