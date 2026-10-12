import { BaseService } from "@common/base/base.service";
import { PermissionType } from "@common/base/permission-type.enum";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { UserEntity } from "@core-service/entities/user";
import { EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type {
  ApprovalRequestFilterDto,
  CreateApprovalRequestDto,
  UpdateApprovalRequestDto,
} from "../../controllers/approval-request/approval-request.validation";
import { ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity } from "../../entities/approval-workflow-version";
import { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { NodeType, workflowDefinitionSchema, type WaitNode } from "../approval-engine/definition.schema";

const userBrief = (u?: UserEntity | null) => (u ? { id: u.id, fullName: u.fullName, avatar: u.avatar } : null);

const LIST_FIELDS = [
  "id",
  "code",
  "title",
  "status",
  "submittedAt",
  "closedAt",
  "createdAt",
  "updatedAt",
  "currentNodeIds",
  "requestType.id",
  "requestType.code",
  "requestType.name",
  "requester.id",
  "requester.fullName",
  "requester.avatar",
  "department.id",
  "department.name",
] as const;

@Injectable({ scope: Scope.REQUEST })
export class ApprovalRequestService extends BaseService<ApprovalRequestEntity> {
  constructor(
    @InjectRepository(ApprovalRequestEntity)
    protected readonly repo: EntityRepository<ApprovalRequestEntity>,
    private readonly engine: ApprovalEngineService,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  /** Loại đơn người dùng có thể tạo: đã phát hành + có quy trình đang chạy */
  async getCreatableRequestTypes() {
    const types = await this.em.find(
      RequestTypeEntity,
      { status: RequestTypeStatus.Published, deleted: { $ne: true } },
      { populate: ["category"], orderBy: { name: "ASC" } },
    );
    const workflows = await this.em.find(
      ApprovalWorkflowEntity,
      { isActive: true, deleted: { $ne: true }, publishedVersion: { $ne: null } },
      { fields: ["id", "requestType"] },
    );
    const withWorkflow = new Set(workflows.map((w) => w.requestType.id));
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      prefix: t.prefix,
      description: t.description,
      category: t.category ? { id: t.category.id, name: t.category.name } : null,
      formSchema: t.formSchema ?? [],
      hasWorkflow: withWorkflow.has(t.id),
    }));
  }

  async createRequest(data: CreateApprovalRequestDto) {
    const user = this.getCurrentUser();
    const requestType = await this.em.findOne(RequestTypeEntity, {
      id: data.requestType,
      status: RequestTypeStatus.Published,
      deleted: { $ne: true },
    });
    if (!requestType) throw new BadRequestException("Request type is not available");
    const departmentId =
      user.department?.id ?? (await this.em.findOne(UserEntity, { id: user.id }, { fields: ["department"] }))?.department?.id;
    if (!departmentId) throw new BadRequestException("User has no department");

    const request = this.em.create(ApprovalRequestEntity, {
      title: data.title,
      requestType,
      requester: this.em.getReference(UserEntity, user.id),
      department: this.em.getReference(DepartmentEntity, departmentId),
      payload: data.payload,
      status: ApprovalRequestStatus.Draft,
      ...this.getDefaultValuesForCreate(),
    });
    await this.setAttachments(request, data.attachments);
    await this.em.flush();

    if (data.submit) await this.engine.submit(request.id, user.id);
    return { id: request.id };
  }

  async updateRequest(id: string, data: UpdateApprovalRequestDto) {
    const request = await this.getOwnEditable(id);
    if (data.title !== undefined) request.title = data.title;
    if (data.payload !== undefined) request.payload = data.payload;
    if (data.attachments) await this.setAttachments(request, data.attachments);
    this.em.assign(request, this.getDefaultValuesForUpdate());
    await this.em.flush();
    return { id };
  }

  async deleteRequest(id: string) {
    const request = await this.getOwnEditable(id);
    if (request.status !== ApprovalRequestStatus.Draft) throw new ConflictException("Only drafts can be deleted");
    return this.remove(id);
  }

  async submitRequest(id: string) {
    await this.engine.submit(id, this.getCurrentUser().id);
    return { id };
  }

  async cancelRequest(id: string, comment?: string) {
    await this.engine.cancel(id, this.getCurrentUser().id, comment);
    return { id };
  }

  async getMyRequests(filter: ApprovalRequestFilterDto) {
    return this.list(filter, { requester: this.getCurrentUser().id });
  }

  async getAllRequests(filter: ApprovalRequestFilterDto) {
    return this.list(filter, filter.requesterId ? { requester: filter.requesterId } : {});
  }

  /** Chi tiết đơn: dữ liệu + định nghĩa quy trình (vẽ sơ đồ) + task + timeline + quyền của người xem */
  async getRequestDetail(id: string) {
    const user = this.getCurrentUser();
    const request = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { populate: ["requestType", "requester", "department", "attachments", "workflowVersion", "workflowVersion.workflow"] },
    );
    if (!request) throw new NotFoundException("Request not found");

    const tasks = await this.em.find(
      ApprovalTaskEntity,
      { request: id },
      { populate: ["approver", "originalApprover", "actedBy"], orderBy: { round: "ASC", createdAt: "ASC" } },
    );
    const isRequester = request.requester.id === user.id;
    const isParticipant = tasks.some((t) => [t.approver?.id, t.originalApprover?.id, t.actedBy?.id].includes(user.id));
    if (!isRequester && !isParticipant && !user.canAccess([PermissionType.MenuAllApprovalRequest])) {
      throw new ForbiddenException("You cannot view this request");
    }

    const histories = await this.em.find(ApprovalHistoryEntity, { request: id }, { populate: ["actor"], orderBy: { createdAt: "ASC" } });
    const version = request.workflowVersion as ApprovalWorkflowVersionEntity | undefined;
    const definition = version ? workflowDefinitionSchema.parse(version.definition) : null;

    const isPending = request.status === ApprovalRequestStatus.Pending;
    const myTask = isPending
      ? tasks.find(
          (t) =>
            t.status === ApprovalTaskStatus.Pending &&
            t.round === request.round &&
            request.currentNodeIds.includes(t.nodeId) &&
            t.approver.id === user.id,
        )
      : undefined;
    const currentNode = myTask ? (definition?.nodes.find((n) => n.id === myTask.nodeId) as WaitNode | undefined) : undefined;
    const editable = isRequester && [ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status);
    const approvedThisRound = tasks.some((t) => t.round === request.round && t.status === ApprovalTaskStatus.Approved);

    return {
      id: request.id,
      code: request.code,
      title: request.title,
      status: request.status,
      payload: request.payload,
      round: request.round,
      currentNodeIds: request.currentNodeIds,
      visitedNodeIds: request.visitedNodeIds,
      submittedAt: request.submittedAt,
      closedAt: request.closedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      requestType: {
        id: request.requestType.id,
        code: request.requestType.code,
        name: request.requestType.name,
        formSchema: request.requestType.formSchema ?? [],
      },
      requester: userBrief(request.requester),
      department: { id: request.department.id, name: request.department.name },
      attachments: request.attachments
        .getItems()
        .map((a) => ({ id: a.id, filename: a.filename, url: a.url, size: a.size, mimetype: a.mimetype })),
      workflow: version ? { id: version.workflow.id, name: version.workflow.name, versionId: version.id, version: version.version } : null,
      definition,
      tasks: tasks.map((t) => ({
        id: t.id,
        round: t.round,
        nodeId: t.nodeId,
        nodeName: t.nodeName,
        status: t.status,
        approver: userBrief(t.approver),
        originalApprover: userBrief(t.originalApprover),
        actedBy: userBrief(t.actedBy),
        comment: t.comment,
        dueAt: t.dueAt,
        remindedAt: t.remindedAt,
        escalatedAt: t.escalatedAt,
        actedAt: t.actedAt,
        createdAt: t.createdAt,
      })),
      histories: histories.map((h) => ({
        id: h.id,
        action: h.action,
        actor: userBrief(h.actor),
        nodeId: h.nodeId,
        nodeName: h.nodeName,
        comment: h.comment,
        data: h.data,
        createdAt: h.createdAt,
      })),
      permissions: {
        canEdit: editable,
        canSubmit: editable,
        canDelete: isRequester && request.status === ApprovalRequestStatus.Draft,
        canCancel: isRequester && (editable || (isPending && !approvedThisRound)),
        canApprove: !!myTask,
        canReject: !!myTask,
        canReturn: !!myTask && (currentNode?.options.allowReturn ?? true),
        requireRejectReason: currentNode?.options.requireRejectReason ?? true,
        canReassign: isPending && user.canAccess([PermissionType.ReassignApprovalTask]),
        myTaskId: myTask?.id ?? null,
        isParallel: currentNode?.type === NodeType.Parallel,
      },
    };
  }

  /* ================= HELPERS ================= */

  private async list(filter: ApprovalRequestFilterDto, base: FilterQuery<ApprovalRequestEntity>) {
    const { page, limit, status, statuses, requestTypeId, search } = filter;
    const where: FilterQuery<ApprovalRequestEntity> = { ...(base as object), deleted: { $ne: true } };
    if (status) where.status = status;
    else if (statuses?.length) where.status = { $in: statuses };
    if (requestTypeId) where.requestType = requestTypeId;
    if (search) where.$or = [{ title: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];
    const result = await this.paginate(where, {
      page,
      limit,
      fields: [...LIST_FIELDS],
      populate: ["requestType", "requester", "department"],
      sort: { updatedAt: "DESC" },
    });
    return { ...result, data: serialize(result.data, { populate: ["requestType", "requester", "department"], forceObject: true }) };
  }

  private async getOwnEditable(id: string) {
    const request = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["attachments"] });
    if (!request) throw new NotFoundException("Request not found");
    if (request.requester.id !== this.getCurrentUser().id) throw new ForbiddenException("Only the requester can edit this request");
    if (![ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status)) {
      throw new ConflictException("Request can no longer be edited");
    }
    return request;
  }

  private async setAttachments(request: ApprovalRequestEntity, ids: string[]) {
    const attachments = ids.length ? await this.em.find(AttachmentEntity, { id: { $in: ids }, deleted: { $ne: true } }) : [];
    request.attachments.set(attachments);
  }
}
