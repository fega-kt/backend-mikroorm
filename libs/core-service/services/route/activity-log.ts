import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { activityLog } from "./order";

/** Menu cấp 1 "Theo dõi hoạt động", tách riêng vì là giám sát/kiểm toán chứ không phải mục cài đặt */
@Injectable()
export class ActivityLogRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteActivityLog() {
    const currentUser = this.request?.user;

    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }

    if (!currentUser.canAccess([PermissionType.MenuActivityLog])) return undefined;

    return {
      path: "/activity-log",
      component: "/system/activity-log/index.tsx",
      handle: {
        keepAlive: false,
        icon: "HistoryOutlined",
        title: "common.menu.activityLog",
        order: activityLog,
        roles: [PermissionType.MenuActivityLog],
        permissions: [],
      },
    };
  }
}
