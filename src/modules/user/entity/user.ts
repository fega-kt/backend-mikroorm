import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { GroupEntity } from "@modules/group/entity/group.entity";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { Collection } from "lodash";

export interface IUser {
  id: string;
  phoneNumber: string;
  fullName: string;
  loginName: string;
  workEmail: string;
  department: DepartmentEntity;
  principal: PrincipalEntity;
  groups: Collection<GroupEntity>;
}
