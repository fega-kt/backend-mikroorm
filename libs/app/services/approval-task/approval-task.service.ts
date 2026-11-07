import { BaseService } from "@common/base/base.service";
import { type DateRange, monthRangeVn } from "@common/utils/vn-date.util";
import { PrincipalEntity } from "@core-service/entities/principal";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { HttpException, Injectable, Scope } from "@nestjs/common";
import type { InboxFilterDto } from "../../controllers/approval-task/approval-task.validation";
import { ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalRequestEntity } from "../../entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalAction, ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { actionableTaskFilter } from "../approval-engine/task-access";
import { buildInboxWhere, pendingTaskWhere } from "./inbox-filter";
import { copyFilesToNextRound } from "../approval-request/request-files";
import { UploadService } from "@core-service/services/upload/upload.service";
import { UserEntity } from "@core-service/entities/user";
import {
  ACTIVITY_ACTIONS,
  activityKind,
  buildAvgApprovalTime,
  type ActedTaskSample,
  type ActivityKind,
  type AvgApprovalTimeStats,
} from "./dashboard-stats";

/** Khối "Hoạt động phê duyệt" chỉ lấy hoạt động trong ngần này ngày */
const ACTIVITY_WINDOW_DAYS = 30;
/** Số tờ trình liên quan tối đa xét khi lấy hoạt động (mới nhất trước) */
const ACTIVITY_REQUEST_CAP = 500;

/** Một dòng ở khối "Hoạt động phê duyệt" */
export interface ApprovalActivityItem {
  id: string;
  kind: ActivityKind;
  /** null → hệ thống (quá hạn tự duyệt / từ chối) */
  actor: { id: string; fullName: string } | null;
  requestId: string;
  title: string;
  /** Người nhận khi kind = reassigned */
  target: { id: string; fullName: string } | null;
  createdAt: Date;
}

/** Thẻ "Tôi đã duyệt tháng này" ở trang chủ */
export interface ApprovedStats {
  thisMonth: number;
  lastMonth: number;
}

/** Thẻ "Tỷ lệ duyệt" ở trang chủ: `rate` là phần trăm (0–100) */
export interface ApprovalRateStats {
  approved: number;
  rejected: number;
  returned: number;
  rate: number;
}

/** Người hoặc nhóm (principal) — cần populate user / group */
const principalBrief = (p?: PrincipalEntity | null) =>
  p
    ? {
        id: p.id,
        type: p.user ? ("user" as const) : ("group" as const),
        name: p.user?.fullName || p.name || p.group?.name || "",
      }
    : null;

@Injectable({ scope: Scope.REQUEST })
export class ApprovalTaskService extends BaseService<ApprovalTaskEntity> {
  constructor(
    @InjectRepository(ApprovalTaskEntity)
    protected readonly repo: EntityRepository<ApprovalTaskEntity>,
    private readonly engine: ApprovalEngineService,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  /** Đơn chờ tôi duyệt / tôi đã xử lý */
  async getInbox(filter: InboxFilterDto) {
    const userId = this.getCurrentUser().id;
    const { page, limit, tab } = filter;
    const where = await buildInboxWhere(this.repo.getEntityManager(), filter, userId);

    const [tasks, total] = await this.repo.findAndCount(where, {
      populate: [
        "request",
        "request.requestTypeVersion",
        "request.formVersion",
        "request.requester",
        "request.department",
        "request.category",
        "approver",
        "approver.user",
        "approver.group",
        "originApprover",
        "originApprover.user",
        "originApprover.group",
      ],
      orderBy:
        tab === "pending" ? { dueAt: "ASC NULLS LAST", createdAt: "ASC" } : tab === "done" ? { actedAt: "DESC" } : { createdAt: "DESC" },
      limit,
      offset: (page - 1) * limit,
    });

    const data = tasks.map((t) => ({
      id: t.id,
      status: t.status,
      nodeId: t.nodeId,
      nodeName: t.nodeName,
      dueAt: t.dueAt,
      actedAt: t.actedAt,
      comment: t.comment,
      createdAt: t.createdAt,
      /** Người / nhóm duyệt theo quy trình */
      originApprover: principalBrief(t.originApprover),
      /** Người / nhóm đang giữ task */
      approver: principalBrief(t.approver),
      /** Task người khác giữ mà tôi xử lý / được xử lý thay theo ủy quyền */
      onBehalfOf: t.approver?.user && t.approver.user.id !== userId ? { id: t.approver.user.id, fullName: t.approver.user.fullName } : null,
      request: {
        id: t.request.id,
        code: t.request.code,
        title: t.request.title,
        status: t.request.status,
        priority: t.request.priority,
        payload: t.request.payload,
        submittedAt: t.request.submittedAt,
        requestType: {
          id: t.request.requestType.id,
          name: t.request.requestTypeVersion.name,
          formId: t.request.formVersion.form.id,
          formSchema: t.request.formVersion.formSchema ?? [],
        },
        requester: { id: t.request.requester.id, fullName: t.request.requester.fullName, avatar: t.request.requester.avatar },
        department: { id: t.request.department.id, name: t.request.department.name },
        category: { id: t.request.category.id, name: t.request.category.name, icon: t.request.category.icon ?? null },
      },
    }));
    return { data, total, page, limit };
  }

  async countPending() {
    const filter = await this.pendingFilter(this.getCurrentUser().id);
    const total = await this.repo.count({ $and: [filter, { request: { deleted: { $ne: true } } }] });
    return { total };
  }

  /** Số task tôi đã xử lý với trạng thái `status` trong khoảng [from, to) */
  private countActed(userId: string, status: ApprovalTaskStatus, range: DateRange): Promise<number> {
    return this.repo.count({
      actedBy: userId,
      status,
      actedAt: { $gte: range.from, $lt: range.to },
      deleted: { $ne: true },
      request: { deleted: { $ne: true } },
    });
  }

  /** Số tờ trình tôi đã duyệt tháng này và tháng trước (giờ Việt Nam) */
  async getApprovedStats(): Promise<ApprovedStats> {
    const userId = this.getCurrentUser().id;
    const [thisMonth, lastMonth] = await Promise.all([
      this.countActed(userId, ApprovalTaskStatus.Approved, monthRangeVn(0)),
      this.countActed(userId, ApprovalTaskStatus.Approved, monthRangeVn(-1)),
    ]);
    return { thisMonth, lastMonth };
  }

  /** Tỷ lệ duyệt tháng này = duyệt / (duyệt + từ chối + trả lại) trong số tờ trình tôi đã xử lý */
  async getApprovalRateStats(): Promise<ApprovalRateStats> {
    const userId = this.getCurrentUser().id;
    const range = monthRangeVn(0);
    const [approved, rejected, returned] = await Promise.all([
      this.countActed(userId, ApprovalTaskStatus.Approved, range),
      this.countActed(userId, ApprovalTaskStatus.Rejected, range),
      this.countActed(userId, ApprovalTaskStatus.Returned, range),
    ]);
    const decided = approved + rejected + returned;
    return { approved, rejected, returned, rate: decided ? Math.round((approved / decided) * 100) : 0 };
  }

  /** Các lượt tôi đã xử lý (duyệt / từ chối / trả lại) trong khoảng [from, to), kèm loại tờ trình */
  private async actedSamples(userId: string, range: DateRange): Promise<ActedTaskSample[]> {
    const tasks = await this.repo.find(
      {
        actedBy: userId,
        status: { $in: [ApprovalTaskStatus.Approved, ApprovalTaskStatus.Rejected, ApprovalTaskStatus.Returned] },
        actedAt: { $gte: range.from, $lt: range.to },
        deleted: { $ne: true },
        request: { deleted: { $ne: true } },
      },
      { fields: ["createdAt", "actedAt", "request.requestType", "request.requestTypeVersion.name", "request.requestTypeVersion.code"] },
    );
    return tasks.flatMap((task) =>
      task.actedAt
        ? [
            {
              requestTypeId: task.request.requestType.id,
              code: task.request.requestTypeVersion.code,
              name: task.request.requestTypeVersion.name,
              createdAt: task.createdAt,
              actedAt: task.actedAt,
            },
          ]
        : [],
    );
  }

  /**
   * Ô "Thời gian duyệt trung bình" ở trang chủ: các lượt tôi đã xử lý tháng này (giờ Việt Nam), số ngày từ lúc task được giao
   * tới lúc tôi xử lý, theo từng loại tờ trình, so với tháng trước.
   */
  async getAvgApprovalTime(): Promise<AvgApprovalTimeStats> {
    const userId = this.getCurrentUser().id;
    const [thisMonth, lastMonth] = await Promise.all([
      this.actedSamples(userId, monthRangeVn(0)),
      this.actedSamples(userId, monthRangeVn(-1)),
    ]);
    return buildAvgApprovalTime(thisMonth, lastMonth);
  }

  /**
   * Khối "Hoạt động phê duyệt" ở trang chủ: gửi / duyệt / từ chối / trả lại / gán lại gần đây (30 ngày) của các tờ trình liên quan tới tôi —
   * tờ trình tôi gửi, hoặc tôi (hay nhóm / ủy quyền của tôi) là người duyệt. Không bao giờ trả hoạt động của tờ trình tôi không liên quan.
   */
  async getRecentActivity(limit = 10): Promise<ApprovalActivityItem[]> {
    const userId = this.getCurrentUser().id;
    const em = this.repo.getEntityManager();

    const actionable = await actionableTaskFilter(em, userId);
    const [involvedTasks, ownRequests] = await Promise.all([
      this.repo.find(
        {
          $or: [{ actedBy: userId }, { approver: { user: userId } }, { originApprover: { user: userId } }, ...actionable],
          request: { deleted: { $ne: true } },
        },
        { fields: ["request"], orderBy: { createdAt: "DESC" }, limit: ACTIVITY_REQUEST_CAP },
      ),
      em.find(
        ApprovalRequestEntity,
        { requester: userId, deleted: { $ne: true } },
        { fields: ["id"], orderBy: { updatedAt: "DESC" }, limit: ACTIVITY_REQUEST_CAP },
      ),
    ]);
    const requestIds = [...new Set([...involvedTasks.map((task) => task.request.id), ...ownRequests.map((request) => request.id)])];
    if (!requestIds.length) return [];

    const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Lấy dư: dòng không hiện (vd hệ thống tự chia lại task nhóm) bị bỏ sau khi lọc
    const histories = await em.find(
      ApprovalHistoryEntity,
      { request: { $in: requestIds, deleted: { $ne: true } }, action: { $in: ACTIVITY_ACTIONS }, createdAt: { $gte: since } },
      {
        fields: ["action", "data", "createdAt", "actor.id", "actor.fullName", "request.id", "request.title"],
        orderBy: { createdAt: "DESC" },
        limit: limit * 3,
      },
    );
    const shown = histories.flatMap((history) => {
      const kind = activityKind(history.action, history.data);
      return kind ? [{ history, kind }] : [];
    });

    // Gán lại: data.to là id người nhận
    const recipientIds = [
      ...new Set(
        shown.flatMap(({ history, kind }) => (kind === "reassigned" && typeof history.data?.to === "string" ? [history.data.to] : [])),
      ),
    ];
    const recipients = recipientIds.length ? await em.find(UserEntity, { id: { $in: recipientIds } }, { fields: ["id", "fullName"] }) : [];
    const recipientById = new Map(recipients.map((user) => [user.id, { id: user.id, fullName: user.fullName }]));

    return shown.slice(0, limit).map(({ history, kind }) => ({
      id: history.id,
      kind,
      actor: history.actor ? { id: history.actor.id, fullName: history.actor.fullName } : null,
      requestId: history.request.id,
      title: history.request.title,
      target: typeof history.data?.to === "string" ? (recipientById.get(history.data.to) ?? null) : null,
      createdAt: history.createdAt,
    }));
  }

  /** Task đang chờ tôi xử lý: tôi giữ, của nhóm tôi đang ở, hoặc tôi được ủy quyền xử lý thay */
  private async pendingFilter(userId: string): Promise<FilterQuery<ApprovalTaskEntity>> {
    return pendingTaskWhere(this.repo.getEntityManager(), userId);
  }

  async act(requestId: string, action: ApprovalAction, comment?: string) {
    const uploadedKeys: string[] = [];
    try {
      await this.engine.act(requestId, action, {
        actorId: this.getCurrentUser().id,
        comment,
        // Trả lại: tệp đang soạn sao chép sang thư mục vòng sau, tệp của vòng vừa duyệt giữ nguyên
        onReturn: ({ em, request }) => copyFilesToNextRound(em, request, this.uploadService, uploadedKeys),
      });
    } catch (error) {
      // Transaction đã rollback: xóa các bản sao vừa tạo trên R2
      await Promise.all(uploadedKeys.map((key) => this.uploadService.deleteObject(key).catch(() => undefined)));
      throw error;
    }
    return { id: requestId };
  }

  /** Duyệt hàng loạt — từng đơn chạy transaction riêng, lỗi đơn nào trả về đơn đó */
  async bulkApprove(requestIds: string[], comment?: string) {
    const actorId = this.getCurrentUser().id;
    const results: { id: string; success: boolean; message?: string }[] = [];
    for (const id of [...new Set(requestIds)]) {
      try {
        await this.engine.act(id, ApprovalAction.Approve, { actorId, comment });
        results.push({ id, success: true });
      } catch (err) {
        const message = err instanceof HttpException ? err.message : "Unexpected error";
        results.push({ id, success: false, message });
      }
    }
    return { results, succeeded: results.filter((r) => r.success).length };
  }

  async reassign(taskId: string, userId: string, comment?: string) {
    await this.engine.reassign(taskId, userId, this.getCurrentUser().id, comment);
    return { id: taskId };
  }
}
