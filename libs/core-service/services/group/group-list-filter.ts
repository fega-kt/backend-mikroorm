import type { FilterQuery } from "@mikro-orm/core";
import type { GroupListFilterDto } from "../../controllers/group/group.validation";
import type { GroupEntity } from "../../entities/group";

/** Điều kiện của danh sách nhóm. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau. */
export function buildGroupListWhere({
  keyword,
  name,
  description,
}: Pick<GroupListFilterDto, "keyword" | "name" | "description">): FilterQuery<GroupEntity> {
  const filter: FilterQuery<GroupEntity> = { deleted: { $ne: true } };
  if (keyword) {
    filter.$or = [{ name: { $ilike: `%${keyword}%` } }, { description: { $ilike: `%${keyword}%` } }];
  }
  if (name) {
    filter.name = { $ilike: `%${name}%` };
  }
  if (description) {
    filter.description = { $ilike: `%${description}%` };
  }
  return filter;
}
