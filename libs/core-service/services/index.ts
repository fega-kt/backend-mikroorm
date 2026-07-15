import { AuthService } from "./auth";
import { UserService } from "./user";
import { RoleService } from "./role";
import { GroupService } from "./group";
import { DepartmentService } from "./department";
import { PrincipalService } from "./principal";
import { AppSettingService } from "./app-setting";
import { RouteService, ProjectManagementRouteService, SettingManagementRouteService, SystemManagementService } from "./route";
import { ActivityLogService } from "./activity-log";
import { ActivityLogQueueService } from "./activity-log-queue";
import { NotificationService } from "./notification";
import { UploadService, AttachmentService } from "./upload";

export {
  AuthService,
  UserService,
  RoleService,
  GroupService,
  DepartmentService,
  PrincipalService,
  AppSettingService,
  RouteService,
  ProjectManagementRouteService,
  SettingManagementRouteService,
  SystemManagementService,
  ActivityLogService,
  ActivityLogQueueService,
  NotificationService,
  UploadService,
  AttachmentService,
};

export const coreServices = [
  AuthService,
  UserService,
  RoleService,
  GroupService,
  DepartmentService,
  PrincipalService,
  AppSettingService,
  RouteService,
  ProjectManagementRouteService,
  SettingManagementRouteService,
  SystemManagementService,
  ActivityLogService,
  ActivityLogQueueService,
  NotificationService,
  UploadService,
  AttachmentService,
];
