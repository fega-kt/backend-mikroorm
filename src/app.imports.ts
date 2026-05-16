import { LoggerModule } from "@common/logger/logger.module";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { ActivityLogModule } from "@modules/activity-log/activity-log.module";
import { AppSettingModule } from "@modules/app-setting/app-setting.module";
import { AuthModule } from "@modules/auth/auth.module";
import { MailModule } from "@modules/mail/mail.module";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { CategoryModule } from "@modules/category/category.module";
import { CommentModule } from "@modules/comment/comment.module";
import { DepartmentModule } from "@modules/department/department.module";
import { GroupModule } from "@modules/group/group.module";
import { HealthModule } from "@modules/health/health.module";
import { MilestoneModule } from "@modules/milestone/milestone.module";
import { NotificationModule } from "@modules/notification/notification.module";
import { RequestTypeModule } from "@modules/request-type/request-type.module";
import { PrincipalModule } from "@modules/principal/principal.module";
import { ProjectModule } from "@modules/project/project.module";
import { RoleModule } from "@modules/role/role.module";
import { RouteModule } from "@modules/route/route.module";
import { SprintModule } from "@modules/sprint/sprint.module";
import { TaskModule } from "@modules/task/task.module";
import { TimeLogModule } from "@modules/timelog/timelog.module";
import { UploadModule } from "@modules/upload/upload.module";
import { UserModule } from "@modules/user/user.module";
import { ModuleMetadata } from "@nestjs/common";

export const modules: ModuleMetadata["imports"] = [
  CloudflareKvModule,
  SupabaseModule,
  MailModule,
  AppSettingModule,
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
  SprintModule,
  MilestoneModule,
  TimeLogModule,
  CommentModule,
  NotificationModule,
  CategoryModule,
  RequestTypeModule,
];
