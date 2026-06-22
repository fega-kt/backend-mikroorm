import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { system } from "../extra-info/order";

@Injectable()
export class SystemManagementService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteUserManagement() {
    const currentUser = this.request.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }
    const canViewUserList = currentUser.canAccess([PermissionType.MenuUser]);
    const canViewRoleList = currentUser.canAccess([PermissionType.MenuRole]);
    const canViewDepartmentList = currentUser.canAccess([PermissionType.MenuDeparment]);
    const canViewGroupList = currentUser.canAccess([PermissionType.MenuGroup]);

    // {
    //           path: "/system/menu",
    //           component: "/system/menu/index.tsx",
    //           handle: {
    //             icon: "MenuOutlined",
    //             title: "common.menu.menu",
    //             roles: ["admin"],
    //             permissions: [],
    //           },
    //         },
    const children = [];

    if (canViewGroupList) {
      children.push({
        path: "/system/group",
        component: "/system/group/index.tsx",
        handle: {
          keepAlive: false,
          icon: "UserOutlined",
          title: "common.menu.group",
          roles: [PermissionType.MenuGroup],
          permissions: [],
        },
      });
    }

    if (canViewUserList) {
      children.push({
        path: "/system/user",
        component: "/system/user/index.tsx",
        handle: {
          keepAlive: false,
          icon: "UserOutlined",
          title: "common.menu.user",
          roles: [PermissionType.MenuUser],
          permissions: [],
        },
      });
    }

    if (canViewRoleList) {
      children.push({
        path: "/system/role",
        component: "/system/role/index.tsx",
        handle: {
          keepAlive: false,
          icon: "TeamOutlined",
          title: "common.menu.role",
          roles: [PermissionType.MenuRole],
          permissions: [],
        },
      });
    }

    if (canViewDepartmentList) {
      children.push({
        path: "/system/dept",
        component: "/system/dept/index.tsx",
        handle: {
          keepAlive: false,
          icon: "ApartmentOutlined",
          title: "common.menu.dept",
          roles: [PermissionType.MenuDeparment],
          permissions: [],
        },
      });
    }

    const systemManagementRouter = {
      path: "/system",
      handle: {
        keepAlive: false,
        icon: "SettingOutlined",
        title: "common.menu.system",
        order: system,
      },
      children,
    };
    return children.length ? systemManagementRouter : undefined;
  }
}
