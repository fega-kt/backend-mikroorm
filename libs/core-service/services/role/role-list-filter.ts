import type { FilterQuery } from "@mikro-orm/core";
import type { RoleEntity } from "../../entities/role";

/** Điều kiện của danh sách vai trò. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau. */
export function buildRoleListWhere({ keyword }: { keyword?: string }): FilterQuery<RoleEntity> {
  const filter: FilterQuery<RoleEntity> = { deleted: { $ne: true } };
  if (keyword) {
    filter.name = { $ilike: `%${keyword}%` };
  }
  return filter;
}
