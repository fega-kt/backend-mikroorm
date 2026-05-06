import { PermissionType } from "@common/base/permission-type.enum";
import { Loaded } from "@mikro-orm/core";
import { DepartmentEntity } from "@modules/department/entity/department.entity";

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
