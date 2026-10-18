import { AuthService, AuthSessionService, LoginDeviceService } from "./auth";
import { UserService } from "./user";
import { RoleService } from "./role";
import { GroupService } from "./group";
import { DepartmentService } from "./department";
import { PrincipalService } from "./principal";
import { AppSettingService } from "./app-setting";
import {
  RouteService,
  ActivityLogRouteService,
  SettingManagementRouteService,
  ApprovalRouteService,
  SystemConfigRouteService,
  SystemManagementService,
} from "./route";
import { ActivityLogService } from "./activity-log";
import { ActivityLogQueueService } from "./activity-log-queue";
import { NotificationService } from "./notification";
import { UploadService, AttachmentService } from "./upload";
import { SystemMailService } from "./email-template";
import { DocumentSigningService, ESignClient, OfficeConverter, SignatureImageStore, SigningCertificateService } from "./e-signature";

export {
  AuthService,
  AuthSessionService,
  LoginDeviceService,
  UserService,
  RoleService,
  GroupService,
  DepartmentService,
  PrincipalService,
  AppSettingService,
  RouteService,
  ActivityLogRouteService,
  SettingManagementRouteService,
  ApprovalRouteService,
  SystemConfigRouteService,
  SystemManagementService,
  ActivityLogService,
  ActivityLogQueueService,
  NotificationService,
  UploadService,
  AttachmentService,
  SystemMailService,
  DocumentSigningService,
  ESignClient,
  OfficeConverter,
  SigningCertificateService,
  SignatureImageStore,
};

export const coreServices = [
  AuthService,
  AuthSessionService,
  LoginDeviceService,
  UserService,
  RoleService,
  GroupService,
  DepartmentService,
  PrincipalService,
  AppSettingService,
  RouteService,
  ActivityLogRouteService,
  SettingManagementRouteService,
  ApprovalRouteService,
  SystemConfigRouteService,
  SystemManagementService,
  ActivityLogService,
  ActivityLogQueueService,
  NotificationService,
  UploadService,
  AttachmentService,
  SystemMailService,
  DocumentSigningService,
  ESignClient,
  OfficeConverter,
  SigningCertificateService,
  SignatureImageStore,
];
