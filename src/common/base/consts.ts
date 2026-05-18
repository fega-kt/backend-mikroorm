import { PermissionType } from "@common/base/permission-type.enum";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { type Loaded } from "@mikro-orm/core";
import { type DepartmentEntity } from "@modules/department/entity/department.entity";

export interface IUserResponse {
  id: string;
  loginName: string;
  fullName: string;
  avatar?: string;
  workEmail?: string;
  phoneNumber?: string;
  description?: string;
  permissions: string[];
  department?: Loaded<DepartmentEntity, never, "code" | "id" | "name", never>;
  canAccess: (pers: PermissionType[]) => boolean;
}

export const SYSTEM_USER: IUserResponse = {
  id: SYSTEM_USER_ID,
  loginName: "system",
  fullName: "System",
  permissions: Object.values(PermissionType),
  canAccess: () => true,
};
