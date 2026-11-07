import type { FilterQuery } from "@mikro-orm/core";
import type { UserListFilterDto } from "../../controllers/user/user.validation";
import type { UserEntity } from "../../entities/user";

/** Điều kiện của danh sách người dùng. Dùng chung cho danh sách và xuất Excel để hai nơi không lệch nhau. */
export function buildUserListWhere({
  keyword,
  fullName,
  phoneNumber,
  isActive,
}: Pick<UserListFilterDto, "keyword" | "fullName" | "phoneNumber" | "isActive">): FilterQuery<UserEntity> {
  const filter: FilterQuery<UserEntity> = { deleted: { $ne: true } };
  if (keyword) {
    filter.$or = [{ fullName: { $ilike: `%${keyword}%` } }, { loginName: { $ilike: `%${keyword}%` } }];
  }
  if (fullName) {
    filter.fullName = { $ilike: `%${fullName}%` };
  }
  if (phoneNumber) {
    filter.phoneNumber = { $ilike: `%${phoneNumber}%` };
  }
  if (isActive !== undefined) {
    filter.isActive = isActive ? true : { $ne: true };
  }
  return filter;
}
