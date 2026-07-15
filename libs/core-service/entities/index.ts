export { UserEntity } from "./user";
export { RoleEntity } from "./role";
export { GroupEntity } from "./group";
export { DepartmentEntity, DepartmentStatus } from "./department";
export { PrincipalEntity, PrincipalType } from "./principal";
export { AppSettingEntity, AppSettingType } from "./app-setting";
export { ActivityLogEntity, ActivityLogAction, ActivityLogType } from "./activity-log";
export { ActivityLogQueueEntity, ActivityLogQueueStatus } from "./activity-log-queue";
export { NotificationEntity, NotificationType } from "./notification";
export { AttachmentEntity } from "./attachment";
export type { AppRoute, RouteHandle } from "./route";

import { UserEntity } from "./user";
import { RoleEntity } from "./role";
import { GroupEntity } from "./group";
import { DepartmentEntity } from "./department";
import { PrincipalEntity } from "./principal";
import { AppSettingEntity } from "./app-setting";
import { ActivityLogEntity } from "./activity-log";
import { ActivityLogQueueEntity } from "./activity-log-queue";
import { NotificationEntity } from "./notification";
import { AttachmentEntity } from "./attachment";

export const coreEntities = [
  UserEntity,
  RoleEntity,
  GroupEntity,
  DepartmentEntity,
  PrincipalEntity,
  AppSettingEntity,
  ActivityLogEntity,
  ActivityLogQueueEntity,
  NotificationEntity,
  AttachmentEntity,
];
