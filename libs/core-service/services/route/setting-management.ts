import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { setting } from "./order";

@Injectable()
export class SettingManagementRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteSettingManagement() {
    const currentUser = this.request?.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }

    const canViewCategoryList = currentUser.canAccess([PermissionType.MenuCategory]);
    const canViewRequestList = currentUser.canAccess([PermissionType.MenuRequestType]);
    const canViewWorkflowSettingList = currentUser.canAccess([PermissionType.MenuWorkflowSetting]);

    const children = [];

    if (canViewCategoryList) {
      children.push({
        path: "/setting/category",
        component: "/setting/category/index.tsx",
        handle: {
          keepAlive: false,
          icon: "TagsOutlined",
          title: "common.menu.category",
          roles: [PermissionType.MenuCategory],
          permissions: [],
        },
      });
    }
    if (canViewRequestList) {
      children.push({
        path: "/setting/request-type",
        component: "/setting/request-type/index.tsx",
        handle: {
          icon: "FileTextOutlined",
          title: "common.menu.requestType",
          permissions: [],
        },
      });
    }
    if (canViewWorkflowSettingList) {
      children.push({
        path: "/setting/workflow-setting",
        component: "/setting/workflow-setting/index.tsx",
        handle: {
          keepAlive: false,
          icon: "NodeIndexOutlined",
          title: "common.menu.workflowSetting",
          roles: [PermissionType.MenuWorkflowSetting],
          permissions: [],
        },
      });
    }

    const settingRouter = {
      path: "/setting",
      handle: {
        keepAlive: false,
        icon: "ToolOutlined",
        title: "common.menu.setting",
        order: setting,
      },
      children,
    };

    return children.length ? settingRouter : undefined;
  }
}
