import { LoggerModule } from "@common/logger/logger.module";
import { DatabaseModule } from "@modules/database/database.module";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { CacheModule } from "@modules/cache/cache.module";
import { ActivityLogModule } from "@modules/activity-log/activity-log.module";
import { AppSettingModule } from "@modules/app-setting/app-setting.module";
import { AuthModule } from "@modules/auth/auth.module";
import { MailModule } from "@modules/mail/mail.module";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { CategoryModule } from "@modules/category/category.module";
import { DepartmentModule } from "@modules/department/department.module";
import { GroupModule } from "@modules/group/group.module";
import { HealthModule } from "@modules/health/health.module";
import { HomeReportModule } from "@modules/home/home-report.module";
import { NotificationModule } from "@modules/notification/notification.module";
import { RequestTypeModule } from "@modules/request-type/request-type.module";
import { WorkflowSettingModule } from "@modules/workflow-setting/workflow-setting.module";
import { PrincipalModule } from "@modules/principal/principal.module";
import { RoleModule } from "@modules/role/role.module";
import { RouteModule } from "@modules/route/route.module";
import { UploadModule } from "@modules/upload/upload.module";
import { UserModule } from "@modules/user/user.module";
import { MetricsModule } from "@modules/metrics/metrics.module";
import { type ModuleMetadata } from "@nestjs/common";

export const modules: ModuleMetadata["imports"] = [
  MetricsModule,
  DatabaseModule,
  CacheModule,
  CloudflareKvModule,
  SupabaseModule,
  MailModule,
  AppSettingModule,
  UploadModule,
  HealthModule,
  HomeReportModule,
  LoggerModule,
  AuthModule,
  UserModule,
  GroupModule,
  DepartmentModule,
  PrincipalModule,
  RoleModule,
  RouteModule,
  ActivityLogModule,
  NotificationModule,
  CategoryModule,
  RequestTypeModule,
  WorkflowSettingModule,
];
