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
    const canManageForms = currentUser.canAccess([PermissionType.MenuForm]);
    const canManageApprovalWorkflows = currentUser.canAccess([PermissionType.MenuApprovalWorkflow]);
    const canViewAllApprovalRequests = currentUser.canAccess([PermissionType.MenuAllApprovalRequest]);
    const canManageEmailTemplates = currentUser.canAccess([PermissionType.MenuEmailTemplate]);

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
    if (canManageForms) {
      children.push({
        path: "/setting/form",
        component: "/setting/form/index.tsx",
        handle: {
          keepAlive: false,
          icon: "FormOutlined",
          title: "common.menu.form",
          roles: [PermissionType.MenuForm],
          permissions: [],
        },
      });
    }
    if (canManageApprovalWorkflows) {
      children.push(
        {
          path: "/setting/approval-workflow",
          component: "/approval/workflows/index.tsx",
          handle: {
            keepAlive: false,
            icon: "NodeIndexOutlined",
            title: "common.menu.approvalWorkflows",
            roles: [PermissionType.MenuApprovalWorkflow],
            permissions: [],
          },
        },
        {
          path: "/setting/approval-workflow/:id",
          component: "/approval/workflow-designer/index.tsx",
          handle: {
            keepAlive: false,
            hideInMenu: true,
            title: "common.menu.approvalWorkflowDesigner",
            currentActiveMenu: "/setting/approval-workflow",
            roles: [PermissionType.MenuApprovalWorkflow],
            permissions: [],
          },
        },
      );
    }
    if (canViewAllApprovalRequests) {
      children.push({
        path: "/setting/approval-requests",
        component: "/approval/all-requests/index.tsx",
        handle: {
          keepAlive: false,
          icon: "ProfileOutlined",
          title: "common.menu.approvalAllRequests",
          roles: [PermissionType.MenuAllApprovalRequest],
          permissions: [],
        },
      });
    }
    if (canManageEmailTemplates) {
      children.push({
        path: "/setting/email-template",
        component: "/setting/email-template/index.tsx",
        handle: {
          keepAlive: false,
          icon: "MailOutlined",
          title: "common.menu.emailTemplate",
          roles: [PermissionType.MenuEmailTemplate],
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
