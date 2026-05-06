import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { setting } from "../extra-info/order";

@Injectable()
export class SettingManagementRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteSettingManagement() {
    const currentUser = this.request?.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }

    const canViewCategoryList = currentUser.canAccess([PermissionType.MenuCategory]);

    const children = [];

    if (canViewCategoryList) {
      children.push({
        path: "/setting/category",
        component: "/setting/category/index.tsx",
        handle: {
          icon: "TagsOutlined",
          title: "common.menu.category",
          roles: [PermissionType.MenuCategory],
          permissions: [],
        },
      });
    }

    const settingRouter = {
      path: "/setting",
      handle: {
        icon: "ToolOutlined",
        title: "common.menu.setting",
        order: setting,
      },
      children,
    };

    return children.length ? settingRouter : undefined;
  }
}
