import { BaseService } from "@common/base/base.service";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { HttpException, Injectable, Scope } from "@nestjs/common";
import type { InboxFilterDto } from "../../controllers/approval-task/approval-task.validation";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalAction, ApprovalEngineService } from "../approval-engine/approval-engine.service";

@Injectable({ scope: Scope.REQUEST })
export class ApprovalTaskService extends BaseService<ApprovalTaskEntity> {
  constructor(
    @InjectRepository(ApprovalTaskEntity)
    protected readonly repo: EntityRepository<ApprovalTaskEntity>,
    private readonly engine: ApprovalEngineService,
  ) {
    super();
  }

  /** Đơn chờ tôi duyệt / tôi đã xử lý */
  async getInbox(filter: InboxFilterDto) {
    const userId = this.getCurrentUser().id;
    const { page, limit, tab, requestTypeId, search } = filter;
    const byTab: Record<typeof tab, FilterQuery<ApprovalTaskEntity>> = {
      pending: { approver: userId, status: ApprovalTaskStatus.Pending },
      done: { actedBy: userId, status: { $ne: ApprovalTaskStatus.Pending } },
      all: { $or: [{ approver: userId }, { actedBy: userId }] },
    };
    const where: FilterQuery<ApprovalTaskEntity> = { ...(byTab[tab] as object), request: { deleted: { $ne: true } } };
    const requestWhere = where.request as Record<string, unknown>;
    if (requestTypeId) requestWhere.requestType = requestTypeId;
    if (search) requestWhere.$or = [{ title: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];

    const [tasks, total] = await this.repo.findAndCount(where, {
      populate: [
        "request",
        "request.requestTypeVersion",
        "request.formVersion",
        "request.requester",
        "request.department",
        "originalApprover",
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
      originalApprover: t.originalApprover ? { id: t.originalApprover.id, fullName: t.originalApprover.fullName } : null,
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
          formSchema: t.request.formVersion.formSchema ?? [],
        },
        requester: { id: t.request.requester.id, fullName: t.request.requester.fullName, avatar: t.request.requester.avatar },
        department: { id: t.request.department.id, name: t.request.department.name },
      },
    }));
    return { data, total, page, limit };
  }

  async countPending() {
    const total = await this.repo.count({
      approver: this.getCurrentUser().id,
      status: ApprovalTaskStatus.Pending,
      request: { deleted: { $ne: true } },
    });
    return { total };
  }

  async act(requestId: string, action: ApprovalAction, comment?: string) {
    await this.engine.act(requestId, action, { actorId: this.getCurrentUser().id, comment });
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
