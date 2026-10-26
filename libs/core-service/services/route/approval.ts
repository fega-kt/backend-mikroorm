import { PermissionType } from "@common/base/permission-type.enum";
import { C403Exception } from "@common/exceptions/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { approvalDelegation, approvalMine, approvalReport, approvalReview } from "./order";

const leaf = (path: string, title: string, icon: string, component: string) => ({
  path,
  component,
  handle: { keepAlive: false, icon, title },
});

/** Menu tờ trình: Tờ trình của tôi, Phê duyệt tờ trình, Ủy quyền duyệt (mọi người dùng) và Báo cáo (theo quyền) */
@Injectable()
export class ApprovalRouteService {
  constructor(@Inject(REQUEST) protected readonly request: Request | undefined) {}

  getRouteApproval() {
    const currentUser = this.request?.user;
    if (!currentUser) {
      throw new C403Exception(ResponseCode.PermissionDenied);
    }

    const mine = "/approval/my-requests/index.tsx";
    const myRequests = {
      path: "/approval/my",
      handle: { keepAlive: false, icon: "FileTextOutlined", title: "common.menu.approvalMy", order: approvalMine },
      children: [
        leaf("/approval/my/draft", "common.menu.approvalMyDraft", "FormOutlined", mine),
        leaf("/approval/my/pending", "common.menu.approvalMyPending", "ClockCircleOutlined", mine),
        leaf("/approval/my/completed", "common.menu.approvalMyCompleted", "CheckCircleOutlined", mine),
        leaf("/approval/my/all", "common.menu.approvalMyAll", "ProfileOutlined", mine),
      ],
    };

    const inbox = "/approval/inbox/index.tsx";
    const review = {
      path: "/approval/review",
      handle: { keepAlive: false, icon: "AuditOutlined", title: "common.menu.approvalReview", order: approvalReview },
      children: [
        leaf("/approval/review/done", "common.menu.approvalReviewDone", "CheckSquareOutlined", inbox),
        leaf("/approval/review/pending", "common.menu.approvalReviewPending", "ClockCircleOutlined", inbox),
        leaf("/approval/review/all", "common.menu.approvalReviewAll", "ProfileOutlined", inbox),
      ],
    };

    const delegation = {
      path: "/approval/delegations",
      component: "/approval/delegations/index.tsx",
      handle: { keepAlive: false, icon: "SwapOutlined", title: "common.menu.approvalDelegations", order: approvalDelegation },
    };

    // Trang ẩn (tạo / sửa / chi tiết) — nhóm riêng vì React Router bắt path con phải bắt đầu bằng path cha
    const requestPages = {
      path: "/approval/requests",
      handle: { keepAlive: false, hideInMenu: true, title: "common.menu.approvalMy" },
      children: [
        {
          path: "/approval/requests/new",
          component: "/approval/request-form/index.tsx",
          handle: { keepAlive: false, hideInMenu: true, title: "common.menu.approvalCreate", currentActiveMenu: "/approval/my/draft" },
        },
        {
          path: "/approval/requests/:id",
          component: "/approval/request-detail/index.tsx",
          handle: { keepAlive: false, hideInMenu: true, title: "common.menu.approvalRequestDetail", currentActiveMenu: "/approval/my/all" },
        },
        {
          path: "/approval/requests/:id/edit",
          component: "/approval/request-form/index.tsx",
          handle: { keepAlive: false, hideInMenu: true, title: "common.menu.approvalRequestEdit", currentActiveMenu: "/approval/my/draft" },
        },
      ],
    };

    // Báo cáo cho cấp quản lý: vào menu cần MenuApprovalReport; phạm vi dữ liệu (toàn hệ thống / phòng ban) do API quyết định
    const report = "/approval/report/index.tsx";
    const reportMenu = currentUser.canAccess([PermissionType.MenuApprovalReport])
      ? {
          path: "/approval/report",
          handle: { keepAlive: false, icon: "BarChartOutlined", title: "common.menu.approvalReport", order: approvalReport },
          children: [
            leaf("/approval/report/overview", "common.menu.approvalReportOverview", "DashboardOutlined", report),
            leaf("/approval/report/performance", "common.menu.approvalReportPerformance", "ThunderboltOutlined", report),
            leaf("/approval/report/backlog", "common.menu.approvalReportBacklog", "HourglassOutlined", report),
            leaf("/approval/report/request-types", "common.menu.approvalReportRequestTypes", "AppstoreOutlined", report),
          ].map((route) => ({
            ...route,
            handle: {
              ...route.handle,
              roles: [PermissionType.MenuApprovalReport],
              permissions: [PermissionType.ViewApprovalReportAll, PermissionType.ViewApprovalReportDepartment],
            },
          })),
        }
      : undefined;

    return [myRequests, review, delegation, ...(reportMenu ? [reportMenu] : []), requestPages];
  }
}
