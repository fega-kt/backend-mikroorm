import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { systemConfig } from "./order";

@Injectable()
export class SystemConfigRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteSystemConfig() {
    const currentUser = this.request?.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }

    const canViewAppSetting = currentUser.canAccess([PermissionType.MenuAppSetting]);
    const canManageEmailTemplates = currentUser.canAccess([PermissionType.MenuEmailTemplate]);
    const canManageI18n = currentUser.canAccess([PermissionType.MenuI18n]);
    const canManageSigningCertificates = currentUser.canAccess([PermissionType.ManageSigningCertificate]);

    const children = [];

    if (canViewAppSetting) {
      children.push({
        path: "/system-config/app-setting",
        component: "/system-config/app-setting/index.tsx",
        handle: {
          keepAlive: false,
          icon: "SlidersOutlined",
          title: "common.menu.appSetting",
          roles: [PermissionType.MenuAppSetting],
          permissions: [],
        },
      });
    }

    // Mẫu email của cả tờ trình lẫn hệ thống (đăng nhập, mật khẩu, nhắc nhở)
    if (canManageEmailTemplates) {
      children.push({
        path: "/system-config/email-template",
        component: "/system-config/email-template/index.tsx",
        handle: {
          keepAlive: false,
          icon: "MailOutlined",
          title: "common.menu.emailTemplate",
          roles: [PermissionType.MenuEmailTemplate],
          permissions: [],
        },
      });
    }

    // Duyệt cấp / thu hồi chứng thư ký số nội bộ
    if (canManageSigningCertificates) {
      children.push({
        path: "/system-config/signing-certificate",
        component: "/system-config/signing-certificate/index.tsx",
        handle: {
          keepAlive: false,
          icon: "SafetyCertificateOutlined",
          title: "common.menu.signingCertificate",
          roles: [PermissionType.ManageSigningCertificate],
          permissions: [],
        },
      });
    }

    // Bản dịch dữ liệu do người dùng nhập (nhãn trường biểu mẫu…)
    if (canManageI18n) {
      children.push({
        path: "/system-config/i18n",
        component: "/system-config/i18n/index.tsx",
        handle: {
          keepAlive: false,
          icon: "TranslationOutlined",
          title: "common.menu.i18n",
          roles: [PermissionType.MenuI18n],
          permissions: [],
        },
      });
    }

    const systemConfigRouter = {
      path: "/system-config",
      handle: {
        keepAlive: false,
        icon: "ControlOutlined",
        title: "common.menu.systemConfig",
        order: systemConfig,
      },
      children,
    };

    return children.length ? systemConfigRouter : undefined;
  }
}
