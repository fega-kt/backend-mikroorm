export { UserEntity } from "./user";
export { RoleEntity } from "./role";
export { GroupEntity } from "./group";
export { DepartmentEntity, DepartmentStatus } from "./department";
export { PrincipalEntity, PrincipalType } from "./principal";
export { AppSettingEntity, AppSettingType } from "./app-setting";
export { ActivityLogEntity, ActivityLogAction, ActivityLogSubject, ActivityLogType } from "./activity-log";
export { ActivityLogQueueEntity, ActivityLogQueueStatus } from "./activity-log-queue";
export { NotificationEntity, NotificationType } from "./notification";
export { AttachmentEntity } from "./attachment";
export { UserDeviceEntity } from "./user-device";
export { EmailTemplateEntity } from "./email-template";
export { SigningCertificateEntity, SigningCertificateStatus } from "./signing-certificate";
export { WorkShiftEntity, type ShiftSegment } from "./work-shift";
export { WorkScheduleEntity, WEEK_ANCHOR_DATE } from "./work-schedule";
export { WorkScheduleAssignmentEntity, WorkTargetType } from "./work-schedule-assignment";
export { WorkDayOverrideEntity, WorkDayType } from "./work-day-override";
export { TranslationEntity } from "./translation";
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
import { UserDeviceEntity } from "./user-device";
import { EmailTemplateEntity } from "./email-template";
import { SigningCertificateEntity } from "./signing-certificate";
import { WorkShiftEntity } from "./work-shift";
import { WorkScheduleEntity } from "./work-schedule";
import { WorkScheduleAssignmentEntity } from "./work-schedule-assignment";
import { WorkDayOverrideEntity } from "./work-day-override";
import { TranslationEntity } from "./translation";

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
  UserDeviceEntity,
  EmailTemplateEntity,
  SigningCertificateEntity,
  WorkShiftEntity,
  WorkScheduleEntity,
  WorkScheduleAssignmentEntity,
  WorkDayOverrideEntity,
  TranslationEntity,
];
