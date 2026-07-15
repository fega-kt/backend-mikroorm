import { AuthController } from "./auth";
import { UserController } from "./user";
import { RoleController } from "./role";
import { GroupController } from "./group";
import { DepartmentController } from "./department";
import { PrincipalController } from "./principal";
import { AppSettingController } from "./app-setting";
import { RouteController } from "./route";
import { ActivityLogController } from "./activity-log";
import { ActivityLogQueueController } from "./activity-log-queue";
import { NotificationController } from "./notification";
import { AttachmentController } from "./upload";

export {
  AuthController,
  UserController,
  RoleController,
  GroupController,
  DepartmentController,
  PrincipalController,
  AppSettingController,
  RouteController,
  ActivityLogController,
  ActivityLogQueueController,
  NotificationController,
  AttachmentController,
};

export const coreControllers = [
  AuthController,
  UserController,
  RoleController,
  GroupController,
  DepartmentController,
  PrincipalController,
  AppSettingController,
  RouteController,
  ActivityLogController,
  ActivityLogQueueController,
  NotificationController,
  AttachmentController,
];
