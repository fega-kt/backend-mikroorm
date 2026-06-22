import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { projectTask } from "../extra-info/order";

@Injectable()
export class ProjectManagementRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteProjectManagement() {
    const currentUser = this.request?.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }
    const canViewProjectList = currentUser.canAccess([PermissionType.MenuProject]);
    const canViewTaskList = currentUser.canAccess([PermissionType.MenuTask]);

    const children = [];

    if (canViewProjectList) {
      children.push({
        path: "/project/list",
        component: "/project/index.tsx",
        handle: {
          keepAlive: false,
          icon: "ProjectOutlined",
          title: "common.menu.project",
          roles: [PermissionType.MenuProject],
          permissions: [],
        },
      });
    }

    if (canViewTaskList) {
      children.push({
        path: "/project/task",
        component: "/task/index.tsx",
        handle: {
          keepAlive: false,
          icon: "FieldTimeOutlined",
          title: "common.menu.task",
          roles: [PermissionType.MenuTask],
          permissions: [],
        },
      });
    }

    const projectManagementRouter = {
      path: "/project",
      handle: {
        keepAlive: false,
        icon: "FundProjectionScreenOutlined",
        title: "common.menu.project_task",
        order: projectTask,
      },
      children,
    };
    return children.length ? projectManagementRouter : undefined;
  }
}
