import { BaseService } from "@common/base/base.service";
import { PermissionType } from "@common/base/permission-type.enum";
import { STORAGE_PATH } from "@common/constants/storage.constant";
import { AttachmentEntity, AttachmentStatus, AttachmentVisibility } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { PrincipalEntity } from "@core-service/entities/principal";
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
  ShareApprovalRequestDto,
  UpdateApprovalRequestDto,
} from "../../controllers/approval-request/approval-request.validation";
import { ApprovalHistoryAction, ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalShareEntity } from "../../entities/approval-share";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity } from "../../entities/approval-workflow-version";
import { CategoryEntity } from "../../entities/category";
import { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { RequestTypeVersionEntity } from "../../entities/request-type-version";
import { ensureLatestFormVersion } from "../form/form-version";
import { ensureLatestTypeVersion } from "../request-type/request-type-version";
import { buildChange, diffFiles, diffPayload, type FieldChange, type FileChangeItem } from "./request-change-log";
import { buildRequestFileFolder, RequestFileCategory } from "./request-file.constants";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { ApproverResolver } from "../approval-engine/approver-resolver";
import { resolveAttachmentConfig } from "../approval-engine/attachment-config";
import { NodeType, workflowDefinitionSchema, type WaitNode } from "../approval-engine/definition.schema";
import { buildTaskAccess, canActOnTask, holderUserId, isGroupTask, type TaskAccess } from "../approval-engine/task-access";

const userBrief = (u?: UserEntity | null) => (u ? { id: u.id, fullName: u.fullName, avatar: u.avatar } : null);
const categoryBrief = (c?: CategoryEntity | null) => (c ? { id: c.id, name: c.name } : null);
/** Người hoặc nhóm (principal) — cần populate user / group */
const principalBrief = (p?: PrincipalEntity | null) =>
  p
    ? {
        id: p.id,
        type: p.user ? ("user" as const) : ("group" as const),
        name: p.user?.fullName || p.name || p.group?.name || "",
        user: userBrief(p.user),
      }
    : null;
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
  "requestType",
  "requestTypeVersion.id",
  "requestTypeVersion.code",
  "requestTypeVersion.name",
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
      { populate: ["category", "form"], orderBy: { name: "ASC" } },
    );
    const workflows = await this.em.find(
      ApprovalWorkflowEntity,
      { isActive: true, deleted: { $ne: true }, publishedVersion: { $ne: null } },
      { fields: ["id", "requestType"] },
    );
    const withWorkflow = new Set(workflows.map((w) => w.requestType.id));
    // Phiên bản hiện hành của từng loại (= bản phiếu mới sẽ gắn); loại chưa có phiên bản nào thì phiếu đầu tiên tạo v1
    const versions = await this.em.find(
      RequestTypeVersionEntity,
      { requestType: { $in: types.map((t) => t.id) } },
      { fields: ["version", "requestType"] },
    );
    const latestVersion = new Map<string, number>();
    for (const v of versions) latestVersion.set(v.requestType.id, Math.max(latestVersion.get(v.requestType.id) ?? 0, v.version));
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      prefix: t.prefix,
      description: t.description,
      category: t.category ? { id: t.category.id, name: t.category.name } : null,
      formId: t.form.id,
      formSchema: t.form.formSchema ?? [],
      attachmentConfig: resolveAttachmentConfig(t.attachmentConfig),
      hasWorkflow: withWorkflow.has(t.id),
      version: latestVersion.get(t.id) ?? 1,
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
    const requestType = await this.em.findOne(
      RequestTypeEntity,
      {
        id: data.requestType,
        status: RequestTypeStatus.Published,
        deleted: { $ne: true },
      },
      { populate: ["form", "category"] },
    );
    if (!requestType) throw new BadRequestException("Request type is not available");
    // Loại tờ trình phải thuộc nhóm đã chọn (danh sách nhóm / loại ở client có thể đã cũ): lệch thì báo lỗi, không lưu
    if (requestType.category?.id !== data.category) {
      throw new BadRequestException("Request type does not belong to the selected category");
    }
    const departmentId = await this.resolveSubmitUnit(data.department);

    // Id do client sinh sẵn (để tệp đã upload nằm đúng thư mục của phiếu): không được trùng phiếu có sẵn
    if (data.id && (await this.em.count(ApprovalRequestEntity, { id: data.id })) > 0) {
      throw new ConflictException("Request id already exists");
    }

    // Gắn cứng phiên bản loại tờ trình (tên, tiền tố, cấu hình tệp…) và phiên bản form lúc này: sửa / xóa loại hay form sau đó không ảnh hưởng phiếu này
    const requestTypeVersion = await ensureLatestTypeVersion(this.em, requestType, this.getDefaultValuesForCreate());
    const formVersion = await ensureLatestFormVersion(this.em, requestType.form, this.getDefaultValuesForCreate());
    const request = this.em.create(ApprovalRequestEntity, {
      ...(data.id ? { id: data.id } : {}),
      title: data.title,
      requestType,
      category: this.em.getReference(CategoryEntity, data.category),
      requestTypeVersion,
      formVersion,
      requester: this.em.getReference(UserEntity, user.id),
      department: this.em.getReference(DepartmentEntity, departmentId),
      payload: data.payload,
      priority: data.priority,
      status: ApprovalRequestStatus.Draft,
      ...this.getDefaultValuesForCreate(),
    });
    await this.setFiles(request, RequestFileCategory.Documents, data.documents);
    await this.setFiles(request, RequestFileCategory.Attachments, data.attachments);
    // Dòng "tạo" ghi luôn thông tin ban đầu (giá trị đầu tiên của từng trường + tệp) để lịch sử cho thấy phiếu tạo với nội dung gì
    const departments = await this.departmentBriefs([departmentId]);
    const initialFiles = [RequestFileCategory.Documents, RequestFileCategory.Attachments].flatMap((category) =>
      this.fileChangeItems(request, category),
    );
    this.recordHistory(request, ApprovalHistoryAction.Create, {
      changes: [
        buildChange("title", null, data.title),
        buildChange("priority", null, data.priority),
        { field: "category", from: null, to: categoryBrief(requestType.category) },
        { field: "department", from: null, to: departments.get(departmentId) ?? null },
        ...diffPayload({}, data.payload),
      ],
      ...(initialFiles.length ? { files: initialFiles } : {}),
    });
    await this.em.flush();

    if (data.submit) await this.engine.submit(request.id, user.id);
    return { id: request.id };
  }

  async updateRequest(id: string, data: UpdateApprovalRequestDto) {
    const request = await this.getOwnEditable(id);
    const changes: FieldChange[] = [];
    if (data.title !== undefined) {
      if (data.title !== request.title) changes.push(buildChange("title", request.title, data.title));
      request.title = data.title;
    }
    if (data.payload !== undefined) {
      changes.push(...diffPayload(request.payload ?? {}, data.payload));
      request.payload = data.payload;
    }
    if (data.priority !== undefined) {
      if (data.priority !== request.priority) changes.push(buildChange("priority", request.priority, data.priority));
      request.priority = data.priority;
    }
    if (data.department) {
      const departmentId = await this.resolveSubmitUnit(data.department);
      if (departmentId !== request.department.id) {
        const names = await this.departmentBriefs([request.department.id, departmentId]);
        changes.push({ field: "department", from: names.get(request.department.id) ?? null, to: names.get(departmentId) ?? null });
      }
      request.department = this.em.getReference(DepartmentEntity, departmentId);
    }

    const files = { added: [] as FileChangeItem[], removed: [] as FileChangeItem[] };
    for (const [category, ids] of [
      [RequestFileCategory.Documents, data.documents],
      [RequestFileCategory.Attachments, data.attachments],
    ] as const) {
      if (!ids) continue;
      const before = this.fileChangeItems(request, category);
      await this.setFiles(request, category, ids);
      const diff = diffFiles(before, this.fileChangeItems(request, category));
      files.added.push(...diff.added);
      files.removed.push(...diff.removed);
    }

    if (changes.length) this.recordHistory(request, ApprovalHistoryAction.Update, { changes });
    if (files.added.length) this.recordHistory(request, ApprovalHistoryAction.FileAdd, { files: files.added });
    if (files.removed.length) this.recordHistory(request, ApprovalHistoryAction.FileRemove, { files: files.removed });
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

  /** Chia sẻ tờ trình (chỉ xem) cho người / nhóm: người trình, người tạo hoặc người tham gia duyệt */
  async shareRequest(id: string, data: ShareApprovalRequestDto) {
    await this.assertCanShare(id);
    return this.engine.share(id, this.getCurrentUser().id, {
      principalIds: data.principals,
      message: data.message,
      inApp: data.sendNotification,
      email: data.sendEmail,
    });
  }

  async removeShare(id: string, shareId: string) {
    await this.assertCanShare(id);
    await this.engine.unshare(id, shareId, this.getCurrentUser().id);
  }

  private async assertCanShare(id: string) {
    const user = this.getCurrentUser();
    const request = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["requester"] });
    if (!request) throw new NotFoundException("Request not found");
    const tasks = await this.em.find(
      ApprovalTaskEntity,
      // Chỉ xét người tham gia của lượt duyệt hiện tại (lượt cũ đã kết thúc)
      { request: id, round: request.round },
      { populate: ["approver", "approver.user", "originApprover", "originApprover.user", "actedBy", "handoverDelegations"] },
    );
    const access = await buildTaskAccess(this.em, tasks, this.delegationScope(request), user.id);
    if (!this.canShareRequest(request, tasks, user, access)) throw new ForbiddenException("You cannot share this request");
  }

  async getMyRequests(filter: ApprovalRequestFilterDto) {
    return this.list(filter, { requester: this.getCurrentUser().id });
  }

  async getAllRequests(filter: ApprovalRequestFilterDto) {
    return this.list(filter, filter.requesterId ? { requester: filter.requesterId } : {});
  }

  /** Người tham gia: người giữ / người duyệt theo quy trình / người đã xử lý, hoặc đang xử lý được (ủy quyền, thành viên nhóm) */
  private isParticipant(tasks: ApprovalTaskEntity[], user: ReturnType<ApprovalRequestService["getCurrentUser"]>, access: TaskAccess) {
    return tasks.some(
      (t) => [holderUserId(t), t.originApprover?.user?.id, t.actedBy?.id].includes(user.id) || canActOnTask(t, user.id, access),
    );
  }

  /** Phiếu đã được chia sẻ cho người dùng — trực tiếp hoặc qua nhóm họ đang là thành viên */
  private async isSharedWith(requestId: string, userId: string, access: TaskAccess) {
    const count = await this.em.count(ApprovalShareEntity, {
      request: requestId,
      deleted: { $ne: true },
      $or: [{ principal: { user: userId } }, { principal: { $in: [...access.memberOf] } }],
    });
    return count > 0;
  }

  /** Người xem hợp lệ: người tạo, người tham gia duyệt, người được chia sẻ, hoặc có quyền xem mọi tờ trình */
  private assertCanView(
    request: ApprovalRequestEntity,
    tasks: ApprovalTaskEntity[],
    user: ReturnType<ApprovalRequestService["getCurrentUser"]>,
    access: TaskAccess,
    shared: boolean,
  ) {
    const isRequester = request.requester.id === user.id;
    if (!isRequester && !shared && !this.isParticipant(tasks, user, access) && !user.canAccess([PermissionType.MenuAllApprovalRequest])) {
      throw new ForbiddenException("You cannot view this request");
    }
  }

  /**
   * Được chia sẻ:
   * - bản nháp: không ai (chưa có ai khác tham gia);
   * - bị trả lại / từ chối: chỉ người trình;
   * - còn lại: người trình, người tạo phiếu, người tham gia duyệt của lượt hiện tại.
   */
  private canShareRequest(
    request: ApprovalRequestEntity,
    tasks: ApprovalTaskEntity[],
    user: ReturnType<ApprovalRequestService["getCurrentUser"]>,
    access: TaskAccess,
  ) {
    if (request.status === ApprovalRequestStatus.Draft) return false;
    const isRequester = request.requester.id === user.id;
    if ([ApprovalRequestStatus.Returned, ApprovalRequestStatus.Rejected].includes(request.status)) return isRequester;
    const currentRound = tasks.filter((t) => t.round === request.round);
    return isRequester || request.createdBy?.id === user.id || this.isParticipant(currentRound, user, access);
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
        { populate: ["approver", "originApprover", "actedBy", "handoverDelegations"] },
      );
      const access = await buildTaskAccess(this.em, tasks, this.delegationScope(request), user.id);
      this.assertCanView(request, tasks, user, access, await this.isSharedWith(request.id, user.id, access));
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
      {
        populate: [
          "category",
          "requestTypeVersion",
          "formVersion",
          "requester",
          "department",
          "documents",
          "attachments",
          "workflowVersion",
          "workflowVersion.workflow",
        ],
      },
    );
    if (!request) throw new NotFoundException("Request not found");

    const tasks = await this.em.find(
      ApprovalTaskEntity,
      { request: id },
      {
        populate: [
          "approver",
          "approver.user",
          "approver.group",
          "originApprover",
          "originApprover.user",
          "originApprover.group",
          "actedBy",
          "handoverDelegations",
        ],
        orderBy: { round: "ASC", createdAt: "ASC" },
      },
    );
    const isRequester = request.requester.id === user.id;
    // Quyền xử lý của tôi (ủy quyền + nhóm) — vừa để phân quyền vừa để hiển thị người được xử lý thay
    const access = await buildTaskAccess(this.em, tasks, this.delegationScope(request), user.id);
    const { delegates } = access;
    const shared = await this.isSharedWith(id, user.id, access);
    this.assertCanView(request, tasks, user, access, shared);
    const delegateIds = [...new Set([...delegates.values()].flat())];
    const delegateUsers = delegateIds.length
      ? await this.em.find(UserEntity, { id: { $in: delegateIds } }, { fields: ["id", "fullName", "avatar"] })
      : [];
    const delegateBriefs = new Map(delegateUsers.map((u) => [u.id, { id: u.id, fullName: u.fullName, avatar: u.avatar }]));

    const histories = await this.em.find(ApprovalHistoryEntity, { request: id }, { populate: ["actor"], orderBy: { createdAt: "ASC" } });
    const shares = await this.em.find(
      ApprovalShareEntity,
      { request: id, deleted: { $ne: true } },
      { populate: ["principal", "principal.user", "principal.group", "createdBy"], orderBy: { createdAt: "ASC" } },
    );
    const version = request.workflowVersion as ApprovalWorkflowVersionEntity | undefined;
    const definition = version ? workflowDefinitionSchema.parse(version.definition) : null;

    const isPending = request.status === ApprovalRequestStatus.Pending;
    // Task tôi được xử lý: của chính tôi (ưu tiên) hoặc được ủy quyền xử lý thay
    const actionable = isPending
      ? tasks.filter(
          (t) =>
            t.status === ApprovalTaskStatus.Pending &&
            t.round === request.round &&
            request.currentNodeIds.includes(t.nodeId) &&
            canActOnTask(t, user.id, access),
        )
      : [];
    // Ưu tiên task tôi giữ, rồi task của nhóm, cuối cùng task xử lý thay
    const myTask = actionable.find((t) => holderUserId(t) === user.id) ?? actionable.find((t) => isGroupTask(t)) ?? actionable[0];
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
        code: request.requestTypeVersion.code,
        name: request.requestTypeVersion.name,
        // Form và cấu hình tệp gắn lúc tạo phiếu, không phải bản hiện hành của loại tờ trình
        formId: request.formVersion.form.id,
        formSchema: request.formVersion.formSchema ?? [],
        attachmentConfig: resolveAttachmentConfig(request.requestTypeVersion.attachmentConfig),
      },
      category: categoryBrief(request.category),
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
        /** Người / nhóm đang giữ task */
        approver: principalBrief(t.approver),
        /** Người / nhóm duyệt theo quy trình (khác `approver` khi được chia từ nhóm, gán lại, chuyển cấp) */
        originApprover: principalBrief(t.originApprover),
        /** Hệ thống chia ngẫu nhiên từ nhóm */
        assignedFromGroup: t.assignedFromGroup,
        actedBy: userBrief(t.actedBy),
        /** Người đang được ủy quyền xử lý thay (chỉ task đang chờ) */
        delegates: (delegates.get(t.id) ?? []).map((id) => delegateBriefs.get(id)).filter(Boolean),
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
      shares: shares.map((sh) => ({
        id: sh.id,
        principal: principalBrief(sh.principal),
        sharedBy: userBrief(sh.createdBy),
        message: sh.message,
        createdAt: sh.createdAt,
      })),
      permissions: {
        canShare: this.canShareRequest(request, tasks, user, access),
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
      populate: ["requestTypeVersion", "requester", "department"],
      sort: { updatedAt: "DESC" },
    });
    const rows = serialize(result.data, { populate: ["requestTypeVersion", "requester", "department"], forceObject: true });
    return { ...result, data: rows.map((row) => this.withRequestTypeBrief(row as unknown as Record<string, unknown>)) };
  }

  /** Giữ nguyên dạng `requestType: { id, code, name }` cho FE, nhưng code / name lấy từ bản chụp lúc tạo phiếu */
  private withRequestTypeBrief(row: Record<string, unknown>) {
    const { requestTypeVersion, requestType, ...rest } = row;
    const id = requestType && typeof requestType === "object" ? (requestType as { id: string }).id : requestType;
    const version = requestTypeVersion as { code?: string; name?: string } | undefined;
    return { ...rest, requestType: { id, code: version?.code, name: version?.name } };
  }

  /** Phạm vi áp dụng ủy quyền của đơn: loại tờ trình + người trình (không xử lý thay đơn của chính mình) */
  private delegationScope(request: ApprovalRequestEntity) {
    return { requesterId: request.requester.id, requestTypeId: request.requestType.id };
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

  /** Ghi một dòng vào timeline của phiếu; được flush cùng thao tác gọi nó (cùng transaction) */
  private recordHistory(request: ApprovalRequestEntity, action: ApprovalHistoryAction, data?: Record<string, unknown>) {
    this.em.create(ApprovalHistoryEntity, {
      request,
      action,
      actor: this.em.getReference(UserEntity, this.getCurrentUser().id),
      data,
      ...this.getDefaultValuesForCreate(),
    });
  }

  private fileChangeItems(request: ApprovalRequestEntity, block: RequestFileCategory): FileChangeItem[] {
    return request[block].getItems().map((f) => ({ id: f.id, filename: f.filename, block }));
  }

  /** Tên phòng ban lúc ghi lịch sử: đổi tên phòng về sau thì dòng lịch sử cũ vẫn đọc đúng như thời điểm sửa */
  private async departmentBriefs(ids: string[]) {
    const departments = await this.em.find(DepartmentEntity, { id: { $in: ids } }, { fields: ["id", "name"] });
    return new Map(departments.map((d) => [d.id, { id: d.id, name: d.name }]));
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
    const { key, uploadUrl, headers, expiresAt, multipart } = await this.uploadService.createUploadUrl({
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
    return { attachmentId: attachment.id, uploadUrl, headers, expiresAt, multipart };
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
