import { BaseService } from "@common/base/base.service";
import { PermissionType } from "@common/base/permission-type.enum";
import { STORAGE_PATH } from "@common/constants/storage.constant";
import { AttachmentEntity, AttachmentStatus, AttachmentVisibility } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { UserEntity } from "@core-service/entities/user";
import { FileContextType } from "@core-service/services/file-view/file-access-policy";
import { UploadService } from "@core-service/services/upload/upload.service";
import { EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type {
  ApprovalRequestFilterDto,
  CreateApprovalRequestDto,
  PresignRequestFileDto,
  PreviewFlowDto,
  UpdateApprovalRequestDto,
} from "../../controllers/approval-request/approval-request.validation";
import { ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity } from "../../entities/approval-workflow-version";
import { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { buildRequestFileFolder, RequestFileCategory } from "./request-file.constants";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { ApproverResolver } from "../approval-engine/approver-resolver";
import { resolveAttachmentConfig } from "../approval-engine/attachment-config";
import { NodeType, workflowDefinitionSchema, type WaitNode } from "../approval-engine/definition.schema";

const userBrief = (u?: UserEntity | null) => (u ? { id: u.id, fullName: u.fullName, avatar: u.avatar } : null);
// File private không lộ URL: FE xin link ký qua getRequestFileUrl khi cần xem/tải
const fileBrief = (a: AttachmentEntity) => ({
  id: a.id,
  filename: a.filename,
  url: a.visibility === AttachmentVisibility.Private ? "" : a.url,
  visibility: a.visibility,
  size: a.size,
  mimetype: a.mimetype,
});

const LIST_FIELDS = [
  "id",
  "code",
  "title",
  "status",
  "priority",
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
    private readonly uploadService: UploadService,
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
      attachmentConfig: resolveAttachmentConfig(t.attachmentConfig),
      hasWorkflow: withWorkflow.has(t.id),
    }));
  }

  /** Đơn vị trình chọn được: phòng của người dùng và các phòng cấp trên (gần nhất trước) */
  async getSubmitUnits() {
    const ownId = await this.userDepartmentId();
    const chain = await new ApproverResolver(this.em).departmentChain(ownId);
    const departments = await this.em.find(DepartmentEntity, { id: { $in: chain } }, { fields: ["id", "name", "code"] });
    const byId = new Map(departments.map((d) => [d.id, d]));
    return chain
      .map((id, level) => ({ id, name: byId.get(id)?.name, code: byId.get(id)?.code, level, isOwn: level === 0 }))
      .filter((d) => d.name);
  }

  /** Xem trước luồng phê duyệt (quy trình + người duyệt từng bước) cho màn tạo tờ trình */
  async previewFlow(data: PreviewFlowDto) {
    const user = this.getCurrentUser();
    const departmentId = await this.resolveSubmitUnit(data.department);
    return this.engine.previewForRequest({ requestTypeId: data.requestType, departmentId, payload: data.payload, requesterId: user.id });
  }

  async createRequest(data: CreateApprovalRequestDto) {
    const user = this.getCurrentUser();
    const requestType = await this.em.findOne(RequestTypeEntity, {
      id: data.requestType,
      status: RequestTypeStatus.Published,
      deleted: { $ne: true },
    });
    if (!requestType) throw new BadRequestException("Request type is not available");
    const departmentId = await this.resolveSubmitUnit(data.department);

    // Id do client sinh sẵn (để tệp đã upload nằm đúng thư mục của phiếu): không được trùng phiếu có sẵn
    if (data.id && (await this.em.count(ApprovalRequestEntity, { id: data.id })) > 0) {
      throw new ConflictException("Request id already exists");
    }

    const request = this.em.create(ApprovalRequestEntity, {
      ...(data.id ? { id: data.id } : {}),
      title: data.title,
      requestType,
      requester: this.em.getReference(UserEntity, user.id),
      department: this.em.getReference(DepartmentEntity, departmentId),
      payload: data.payload,
      priority: data.priority,
      status: ApprovalRequestStatus.Draft,
      ...this.getDefaultValuesForCreate(),
    });
    await this.setFiles(request, RequestFileCategory.Documents, data.documents);
    await this.setFiles(request, RequestFileCategory.Attachments, data.attachments);
    await this.em.flush();

    if (data.submit) await this.engine.submit(request.id, user.id);
    return { id: request.id };
  }

  async updateRequest(id: string, data: UpdateApprovalRequestDto) {
    const request = await this.getOwnEditable(id);
    if (data.title !== undefined) request.title = data.title;
    if (data.payload !== undefined) request.payload = data.payload;
    if (data.priority !== undefined) request.priority = data.priority;
    if (data.department) request.department = this.em.getReference(DepartmentEntity, await this.resolveSubmitUnit(data.department));
    if (data.documents) await this.setFiles(request, RequestFileCategory.Documents, data.documents);
    if (data.attachments) await this.setFiles(request, RequestFileCategory.Attachments, data.attachments);
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

  /** Người xem hợp lệ: người tạo, người tham gia duyệt, hoặc có quyền xem mọi tờ trình */
  private assertCanView(
    request: ApprovalRequestEntity,
    tasks: ApprovalTaskEntity[],
    user: ReturnType<ApprovalRequestService["getCurrentUser"]>,
  ) {
    const isRequester = request.requester.id === user.id;
    const isParticipant = tasks.some((t) => [t.approver?.id, t.originalApprover?.id, t.actedBy?.id].includes(user.id));
    if (!isRequester && !isParticipant && !user.canAccess([PermissionType.MenuAllApprovalRequest])) {
      throw new ForbiddenException("You cannot view this request");
    }
  }

  /**
   * Tệp mà người dùng hiện tại được xem trong ngữ cảnh một tờ trình.
   * - Phiếu đã có: phải xem được phiếu (người tạo, người tham gia duyệt, hoặc quyền xem mọi tờ trình), và tệp thuộc phiếu.
   * - Tệp chưa gắn vào phiếu (đang soạn, chưa lưu): chỉ chính người đã upload, và phải nằm trong thư mục của phiếu.
   */
  async resolveViewableFile(requestId: string, fileId: string): Promise<AttachmentEntity> {
    const user = this.getCurrentUser();
    const request = await this.repo.findOne(
      { id: requestId, deleted: { $ne: true } },
      { populate: ["requester", "documents", "attachments"] },
    );

    if (request) {
      const tasks = await this.em.find(
        ApprovalTaskEntity,
        { request: requestId },
        { populate: ["approver", "originalApprover", "actedBy"] },
      );
      this.assertCanView(request, tasks, user);
      const linked = [...request.documents.getItems(), ...request.attachments.getItems()].find((f) => f.id === fileId && !f.deleted);
      if (linked) return linked;
    }

    const file = await this.em.findOne(AttachmentEntity, { id: fileId, deleted: { $ne: true }, status: AttachmentStatus.Ready });
    const ownUnsaved = file?.createdBy.id === user.id && file.key.startsWith(`${STORAGE_PATH.ATTACHMENTS}/${requestId}/`);
    if (!file || !ownUnsaved) throw new NotFoundException("File not found");
    return file;
  }

  /** Chi tiết đơn: dữ liệu + định nghĩa quy trình (vẽ sơ đồ) + task + timeline + quyền của người xem */
  async getRequestDetail(id: string) {
    const user = this.getCurrentUser();
    const request = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { populate: ["requestType", "requester", "department", "documents", "attachments", "workflowVersion", "workflowVersion.workflow"] },
    );
    if (!request) throw new NotFoundException("Request not found");

    const tasks = await this.em.find(
      ApprovalTaskEntity,
      { request: id },
      { populate: ["approver", "originalApprover", "actedBy"], orderBy: { round: "ASC", createdAt: "ASC" } },
    );
    const isRequester = request.requester.id === user.id;
    this.assertCanView(request, tasks, user);

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
      priority: request.priority,
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
        attachmentConfig: resolveAttachmentConfig(request.requestType.attachmentConfig),
      },
      requester: userBrief(request.requester),
      department: { id: request.department.id, name: request.department.name },
      documents: request.documents.getItems().map(fileBrief),
      attachments: request.attachments.getItems().map(fileBrief),
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
    const request = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["documents", "attachments"] });
    if (!request) throw new NotFoundException("Request not found");
    if (request.requester.id !== this.getCurrentUser().id) throw new ForbiddenException("Only the requester can edit this request");
    if (![ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status)) {
      throw new ConflictException("Request can no longer be edited");
    }
    return request;
  }

  private async setFiles(request: ApprovalRequestEntity, field: RequestFileCategory, ids: string[]) {
    const files = ids.length
      ? await this.em.find(AttachmentEntity, { id: { $in: ids }, deleted: { $ne: true }, status: AttachmentStatus.Ready })
      : [];
    const userId = this.getCurrentUser().id;
    const folder = `${buildRequestFileFolder(request.id, field)}/`;
    // Chỉ gắn tệp do chính người dùng upload và nằm đúng thư mục của phiếu + loại tệp:
    // chặn việc gắn tệp (private) của người khác hoặc của phiếu khác để xin link tải
    if (files.length !== ids.length || files.some((f) => f.createdBy.id !== userId || !f.key.startsWith(folder))) {
      throw new BadRequestException("Some files are invalid");
    }
    request[field].set(files);
  }

  /**
   * Link upload thẳng lên R2 cho một tệp của tờ trình, vào Attachments/{requestId}/{loại}/{tên file}.
   * Phiếu đã tồn tại thì chỉ người tạo (khi đang soạn / bị trả lại) được upload; chưa tồn tại thì id đang được client giữ chỗ.
   */
  async presignFileUpload(requestId: string, data: PresignRequestFileDto) {
    const user = this.getCurrentUser();
    const existing = await this.repo.findOne({ id: requestId, deleted: { $ne: true } }, { populate: ["requester"] });
    if (existing) {
      if (existing.requester.id !== user.id) throw new ForbiddenException("You cannot upload files to this request");
      if (![ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(existing.status)) {
        throw new ConflictException("Files can only be changed while the request is a draft or returned");
      }
    }

    const folder = buildRequestFileFolder(requestId, data.category);
    const { key, uploadUrl, headers, expiresAt } = await this.uploadService.createUploadUrl({
      folder,
      filename: data.filename,
      mimetype: data.mimetype,
      size: data.size,
    });
    const attachment = this.em.create(AttachmentEntity, {
      filename: data.filename.trim(),
      mimetype: data.mimetype,
      size: data.size,
      key,
      url: "",
      visibility: AttachmentVisibility.Private,
      status: AttachmentStatus.Pending,
      storagePath: folder,
      // Ghi chủ sở hữu: về sau chỉ cần id tệp là biết áp quy tắc phân quyền nào khi xem
      contextType: FileContextType.ApprovalRequest,
      refId: requestId,
      ...this.getDefaultValuesForCreate(),
    });
    await this.em.flush();
    return { attachmentId: attachment.id, uploadUrl, headers, expiresAt };
  }

  private async userDepartmentId() {
    const user = this.getCurrentUser();
    const departmentId =
      user.department?.id ?? (await this.em.findOne(UserEntity, { id: user.id }, { fields: ["department"] }))?.department?.id;
    if (!departmentId) throw new BadRequestException("User has no department");
    return departmentId;
  }

  /** Đơn vị trình hợp lệ: phòng của người dùng hoặc phòng cấp trên; bỏ trống → phòng của người dùng */
  private async resolveSubmitUnit(requested?: string) {
    const ownId = await this.userDepartmentId();
    if (!requested || requested === ownId) return ownId;
    const chain = await new ApproverResolver(this.em).departmentChain(ownId);
    if (!chain.includes(requested)) throw new BadRequestException("Submitting unit must be your department or a parent department");
    return requested;
  }
}
