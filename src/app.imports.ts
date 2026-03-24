import { LoggerModule } from "@common/logger/logger.module";
import { ActivityLogModule } from "@modules/activity-log/activity-log.module";
import { AuthModule } from "@modules/auth/auth.module";
import { DepartmentModule } from "@modules/department/department.module";
import { GroupModule } from "@modules/group/group.module";
import { HealthModule } from "@modules/health/health.module";
import { PrincipalModule } from "@modules/principal/principal.module";
import { ProjectModule } from "@modules/project/project.module";
import { RoleModule } from "@modules/role/role.module";
import { RouteModule } from "@modules/route/route.module";
import { TaskModule } from "@modules/task/task.module";
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
  ActivityLogModule,
  ProjectModule,
  TaskModule,
];
