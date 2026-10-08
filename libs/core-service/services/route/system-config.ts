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
