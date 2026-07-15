import { defineFields, definePopulate } from "@common/base/entity-fields";
import { type Loaded } from "@mikro-orm/core";
import { type DepartmentEntity } from "../../entities/department";

export const DEPARTMENT_DETAIL_FIELDS = defineFields<DepartmentEntity>()([
  "id",
  "code",
  "name",
  "parent",
  "parent.id",
  "parent.name",
  "parent.code",
  "status",
  "manager",
  "deputy",
  "manager.id",
  "manager.workEmail",
  "manager.fullName",
  "manager.avatar",
  "deputy.id",
  "deputy.fullName",
  "deputy.avatar",
  "deputy.workEmail",
  "users",
  "users.id",
  "users.loginName",
  "users.fullName",
  "users.avatar",
  "users.workEmail",
  "users.phoneNumber",
  "users.isActive",
]);

export const DEPARTMENT_DETAIL_POPULATE = definePopulate<DepartmentEntity>()(["manager", "deputy", "parent", "users"]);

export type DepartmentDetail = Loaded<
  DepartmentEntity,
  (typeof DEPARTMENT_DETAIL_POPULATE)[number],
  (typeof DEPARTMENT_DETAIL_FIELDS)[number]
>;

export type DepartmentParent = Loaded<DepartmentEntity, never, "id" | "code" | "parentCode">;
