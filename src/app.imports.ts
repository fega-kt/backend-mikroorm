import { LoggerModule } from "@common/logger/logger.module";
import { AuthModule } from "@modules/auth/auth.module";
import { DepartmentModule } from "@modules/department/department.module";
import { GroupModule } from "@modules/group/group.module";
import { HealthModule } from "@modules/health/health.module";
import { PrincipalModule } from "@modules/principal/principal.module";
import { RoleModule } from "@modules/role/role.module";
import { UserSettingModule } from "@modules/user-setting/user-setting.module";
import { UserModule } from "@modules/user/user.module";
import { ModuleMetadata } from "@nestjs/common";

export const modules: ModuleMetadata["imports"] = [
  HealthModule,
  LoggerModule,
  AuthModule,
  UserModule,
  GroupModule,
  DepartmentModule,
  PrincipalModule,
  UserSettingModule,
  RoleModule,
];
