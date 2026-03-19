import { PermissionType } from "@common/base/permission-type.enum";

export interface IUserResponse {
  id: string;
  loginName: string;
  permissions: string[];
  canAccess: (pers: PermissionType[]) => boolean;
}
