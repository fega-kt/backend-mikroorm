import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { GroupEntity } from "@modules/group/entity/group.entity";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { UserSettingEntity } from "@modules/user-setting/entity/user-setting.entity";
import { Collection } from "lodash";

export interface IUser {
  email: string;
  name: string;
  department: DepartmentEntity;
  principal: PrincipalEntity;
  setting: UserSettingEntity;
  groups: Collection<GroupEntity>;
}
