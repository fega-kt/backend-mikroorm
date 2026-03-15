import { LoggerModule } from "@common/logger/logger.module";
import { AuthModule } from "@modules/auth/auth.module";
import { DepartmentModule } from "@modules/department/department.module";
import { GroupModule } from "@modules/group/group.module";
import { HealthModule } from "@modules/health/health.module";
import { PrincipalModule } from "@modules/principal/principal.module";
import { RoleModule } from "@modules/role/role.module";
import { RouteModule } from "@modules/route/route.module";
import { UploadModule } from "@modules/upload/upload.module";
import { UserModule } from "@modules/user/user.module";
import { ModuleMetadata } from "@nestjs/common";

export const modules: ModuleMetadata["imports"] = [
  UploadModule,
  HealthModule,
  LoggerModule,
  AuthModule,
  UserModule,
  GroupModule,
  DepartmentModule,
  PrincipalModule,
  RoleModule,
  RouteModule,
];
