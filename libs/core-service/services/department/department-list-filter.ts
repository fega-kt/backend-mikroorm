import type { FilterQuery } from "@mikro-orm/core";
import type { DepartmentListFilterDto } from "../../controllers/department/department.validation";
import type { DepartmentEntity } from "../../entities/department";

/** Điều kiện của danh sách phòng ban. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau. */
export function buildDepartmentListWhere({
  keyword,
  name,
  code,
  status,
}: Pick<DepartmentListFilterDto, "keyword" | "name" | "code" | "status">): FilterQuery<DepartmentEntity> {
  const filter: FilterQuery<DepartmentEntity> = { deleted: { $ne: true } };
  if (keyword) {
    filter.$or = [{ name: { $ilike: `%${keyword}%` } }, { code: { $ilike: `%${keyword}%` } }];
  }
  if (name) {
    filter.name = { $ilike: `%${name}%` };
  }
  if (code) {
    filter.code = { $ilike: `%${code}%` };
  }
  if (status !== undefined) {
    filter.status = status;
  }
  return filter;
}
