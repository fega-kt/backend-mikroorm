import { defineFields, definePopulate } from "@common/base/entity-fields";
import { Loaded } from "@mikro-orm/core";
import { DepartmentEntity } from "../entity/department.entity";

export const DEPARTMENT_DETAIL_FIELDS = defineFields<DepartmentEntity>()([
  "id",
  "code",
  "name",
  "parent",
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
]);

export const DEPARTMENT_DETAIL_POPULATE = definePopulate<DepartmentEntity>()(["manager", "deputy"]);

export type DepartmentDetail = Loaded<
  DepartmentEntity,
  (typeof DEPARTMENT_DETAIL_POPULATE)[number],
  (typeof DEPARTMENT_DETAIL_FIELDS)[number]
>;

export type DepartmentParent = Loaded<DepartmentEntity, never, "id" | "code" | "parentCode">;
