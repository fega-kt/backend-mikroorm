import { BaseService } from "@common/base/base.service";
import { type DateRange, monthRangeVn } from "@common/utils/vn-date.util";
import { PrincipalEntity } from "@core-service/entities/principal";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { HttpException, Injectable, Scope } from "@nestjs/common";
import type { InboxFilterDto } from "../../controllers/approval-task/approval-task.validation";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalAction, ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { actionableTaskFilter } from "../approval-engine/task-access";
import { copyFilesToNextRound } from "../approval-request/request-files";
import { UploadService } from "@core-service/services/upload/upload.service";

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
    const { page, limit, tab, requestTypeId, search } = filter;
    const pendingMine = await this.pendingFilter(userId);
    const byTab: Record<typeof tab, FilterQuery<ApprovalTaskEntity>> = {
      pending: pendingMine,
      done: { actedBy: userId, status: { $ne: ApprovalTaskStatus.Pending } },
      all: { $or: [pendingMine, { approver: { user: userId } }, { actedBy: userId }] },
    };
    const requestWhere: Record<string, unknown> = { deleted: { $ne: true } };
    if (requestTypeId) requestWhere.requestType = requestTypeId;
    if (search) requestWhere.$or = [{ title: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];
    const where: FilterQuery<ApprovalTaskEntity> = { $and: [byTab[tab], { request: requestWhere }] };

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

  /** Task đang chờ tôi xử lý: tôi giữ, của nhóm tôi đang ở, hoặc tôi được ủy quyền xử lý thay */
  private async pendingFilter(userId: string): Promise<FilterQuery<ApprovalTaskEntity>> {
    const conditions = await actionableTaskFilter(this.repo.getEntityManager(), userId);
    return { status: ApprovalTaskStatus.Pending, $or: conditions };
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
