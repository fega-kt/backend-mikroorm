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
import type { Archiver } from "archiver";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
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
import { buildRequestFileFolder, isRequestFileKey, RequestFileCategory } from "./request-file.constants";
import { ApprovalRequestFileEntity } from "../../entities/approval-request-file";
import { ApprovalFileSignatureEntity } from "../../entities/approval-file-signature";
import { draftRound, loadRequestFiles, setRequestFiles } from "./request-files";
import {
  ARCHIVE_TOKEN_TTL_SECONDS,
  archiveFilename,
  buildArchiveEntries,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_FILES,
  RequestArchiveKind,
  type ArchiveEntry,
} from "./request-files-archive";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { ApproverResolver } from "../approval-engine/approver-resolver";
import { requestFilesError, resolveAttachmentConfig } from "../approval-engine/attachment-config";
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

/** Bộ tệp từng vòng: mỗi tệp có tệp gốc + bản hiện tại (khác gốc khi đã chuyển PDF / đã ký) + các lần ký theo task */
function groupRoundFiles(rows: ApprovalRequestFileEntity[], signatures: ApprovalFileSignatureEntity[]) {
  const rounds = new Map<number, { round: number; documents: unknown[]; attachments: unknown[] }>();
  for (const row of rows) {
    const group = rounds.get(row.round) ?? { round: row.round, documents: [], attachments: [] };
    rounds.set(row.round, group);
    group[row.category].push({
      original: fileBrief(row.original),
      current: row.current.id === row.original.id ? null : fileBrief(row.current),
      /** Chuyển sang PDF để ký: pending / done / failed; null = không cần chuyển (PDF sẵn, tài liệu đính kèm) */
      convertStatus: row.convertStatus ?? null,
      signatureCount: row.signatureCount,
      signatures: signatures
        .filter((s) => s.requestFile.id === row.id)
        .map((s) => ({
          id: s.id,
          taskId: s.task.id,
          nodeName: s.task.nodeName,
          signer: { id: s.signer.id, fullName: s.signer.fullName, avatar: s.signer.avatar },
          signedAt: s.createdAt,
          status: s.status,
          file: fileBrief(s.after),
        })),
    });
  }
  return [...rounds.values()];
}

/** Vé tải zip lưu ở cache (dùng một lần): danh sách tệp đã kiểm quyền lúc cấp vé */
export interface ArchiveTicket {
  filename: string;
  entries: ArchiveEntry[];
}

const archiveTicketKey = (token: string) => `approval:files-archive:${token}`;

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
  "category.id",
  "category.name",
  "category.icon",
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
    const documents = await this.setFiles(request, RequestFileCategory.Documents, data.documents);
    const attachments = await this.setFiles(request, RequestFileCategory.Attachments, data.attachments);
    this.assertDraftFiles(requestTypeVersion.attachmentConfig, { documents: documents.files, attachments: attachments.files });
    const initialFiles = [...documents.items, ...attachments.items];
    // Dòng "tạo" ghi luôn thông tin ban đầu (giá trị đầu tiên của từng trường + tệp) để lịch sử cho thấy phiếu tạo với nội dung gì
    const departments = await this.departmentBriefs([departmentId]);
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
    // Bộ tệp sau khi lưu: loại có gửi lên thì là danh sách mới, không gửi thì giữ bộ đang có
    const current: Record<RequestFileCategory, AttachmentEntity[]> = {
      [RequestFileCategory.Documents]: [],
      [RequestFileCategory.Attachments]: [],
    };
    for (const [category, ids] of [
      [RequestFileCategory.Documents, data.documents],
      [RequestFileCategory.Attachments, data.attachments],
    ] as const) {
      if (!ids) {
        current[category] = (await loadRequestFiles(this.em, request.id, draftRound(request), category)).map((row) => row.original);
        continue;
      }
      const before = await this.draftFileItems(request, category);
      const next = await this.setFiles(request, category, ids);
      current[category] = next.files;
      const diff = diffFiles(before, next.items);
      files.added.push(...diff.added);
      files.removed.push(...diff.removed);
    }
    await this.em.populate(request, ["requestTypeVersion"]);
    this.assertDraftFiles(request.requestTypeVersion.attachmentConfig, {
      documents: current[RequestFileCategory.Documents],
      attachments: current[RequestFileCategory.Attachments],
    });

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
    const request = await this.repo.findOne({ id: requestId, deleted: { $ne: true } }, { populate: ["requester"] });

    if (request) {
      await this.assertViewable(request);
      // Tệp của phiếu ở mọi vòng (kể cả bản đang soạn): tệp gốc, bản PDF chuyển đổi, bản ký mới nhất
      const row = await this.em.findOne(
        ApprovalRequestFileEntity,
        { request: requestId, $or: [{ original: fileId }, { current: fileId }] },
        { populate: ["original", "current"] },
      );
      const inRequest = row && [row.current, row.original].find((f) => f.id === fileId && !f.deleted);
      if (inRequest) return inRequest;
      // Bản ký theo từng task (lịch sử ký) và bản trước khi ký
      const signature = await this.em.findOne(
        ApprovalFileSignatureEntity,
        { request: requestId, $or: [{ after: fileId }, { before: fileId }] },
        { populate: ["before", "after"] },
      );
      const signed = signature && [signature.after, signature.before].find((f) => f.id === fileId && !f.deleted);
      if (signed) return signed;
    }

    const file = await this.em.findOne(AttachmentEntity, { id: fileId, deleted: { $ne: true }, status: AttachmentStatus.Ready });
    const ownUnsaved = file?.createdBy.id === user.id && file.key.startsWith(`${STORAGE_PATH.ATTACHMENTS}/${requestId}/`);
    if (!file || !ownUnsaved) throw new NotFoundException("File not found");
    return file;
  }

  /** Người dùng hiện tại xem được tờ trình (cần populate requester), không thì ForbiddenException */
  private async assertViewable(request: ApprovalRequestEntity) {
    const user = this.getCurrentUser();
    const tasks = await this.em.find(
      ApprovalTaskEntity,
      { request: request.id },
      { populate: ["approver", "originApprover", "actedBy", "handoverDelegations"] },
    );
    const access = await buildTaskAccess(this.em, tasks, this.delegationScope(request), user.id);
    this.assertCanView(request, tasks, user, access, await this.isSharedWith(request.id, user.id, access));
  }

  /**
   * "Tải về toàn bộ": cùng quyền với xem tờ trình. Chốt danh sách tệp của bộ tệp đang hiển thị (đang soạn / vòng hiện tại)
   * rồi cấp link tải dùng một lần — trình duyệt mở link là tải zip như một tệp thường (không cần header đăng nhập).
   */
  async prepareFilesArchive(requestId: string, kind: RequestArchiveKind) {
    const request = await this.repo.findOne({ id: requestId, deleted: { $ne: true } }, { populate: ["requester"] });
    if (!request) throw new NotFoundException("Request not found");
    await this.assertViewable(request);

    const editing = [ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status);
    // Đang soạn chưa có bản ký số của vòng nào để tải
    if (editing && kind === RequestArchiveKind.Signed) {
      throw new BadRequestException({ code: "NO_SIGNED_FILES", message: "The request has no signed files yet" });
    }
    const rows = await loadRequestFiles(this.em, request.id, editing ? draftRound(request) : request.round);
    const entries = buildArchiveEntries(rows, kind);
    if (!entries.length) throw new BadRequestException({ code: "NO_FILES", message: "There is no file to download" });
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (entries.length > MAX_ARCHIVE_FILES || totalBytes > MAX_ARCHIVE_BYTES) {
      throw new BadRequestException({ code: "ARCHIVE_TOO_LARGE", message: "Too many files to download at once" });
    }

    const token = randomBytes(24).toString("base64url");
    const ticket: ArchiveTicket = { filename: archiveFilename(request.code, kind), entries };
    await this.cache.set(archiveTicketKey(token), ticket, ARCHIVE_TOKEN_TTL_SECONDS);
    return { downloadPath: `/approval-request/files/archive/${token}`, filename: ticket.filename, count: entries.length, totalBytes };
  }

  /** Lấy (và hủy luôn) vé tải zip: link chỉ dùng được một lần */
  async takeFilesArchive(token: string): Promise<ArchiveTicket> {
    const key = archiveTicketKey(token);
    const ticket = await this.cache.get<ArchiveTicket>(key);
    if (!ticket) throw new NotFoundException("Download link is invalid or expired");
    await this.cache.del(key);
    return ticket;
  }

  /**
   * Ghi các tệp của vé vào zip, đọc lần lượt từng tệp từ R2. Người tải ngắt giữa chừng (signal) thì dừng ngay,
   * hủy luôn stream đang đọc để không tải tiếp từ R2.
   */
  async writeFilesArchive(ticket: ArchiveTicket, archive: Archiver, signal: AbortSignal) {
    for (const entry of ticket.entries) {
      signal.throwIfAborted();
      const { body } = await this.uploadService.getObject(entry.key);
      const destroy = () => body.destroy();
      signal.addEventListener("abort", destroy, { once: true });
      try {
        // Mở tệp kế tiếp chỉ khi tệp này đã ghi xong: không mở cùng lúc hàng chục kết nối tới R2
        const written = once(archive, "entry", { signal });
        archive.append(body, { name: entry.name });
        await written;
      } finally {
        signal.removeEventListener("abort", destroy);
      }
    }
    await archive.finalize();
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
    const requestFiles = await this.em.find(
      ApprovalRequestFileEntity,
      { request: id },
      { populate: ["original", "current"], orderBy: { round: "DESC", category: "ASC", position: "ASC" } },
    );
    const signatures = await this.em.find(
      ApprovalFileSignatureEntity,
      { request: id },
      { populate: ["task", "signer", "after"], orderBy: { createdAt: "ASC" } },
    );
    // documents / attachments: đang soạn / bị trả lại → bộ tệp đang soạn; còn lại → bộ tệp của vòng hiện tại
    const editingFiles = [ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status);
    const shownRound = editingFiles ? draftRound(request) : request.round;
    const shownFiles = (category: RequestFileCategory) =>
      requestFiles.filter((f) => f.round === shownRound && f.category === category).map((f) => fileBrief(f.original));
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
      documents: shownFiles(RequestFileCategory.Documents),
      attachments: shownFiles(RequestFileCategory.Attachments),
      /** Bộ tệp từng vòng duyệt (mới nhất trước); tờ trình gửi trước khi lưu theo vòng thì rỗng */
      rounds: groupRoundFiles(
        requestFiles.filter((f) => f.round <= request.round),
        signatures,
      ),
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
        /** Bước hiện tại bắt buộc ký số: chỉ duyệt bằng "Ký và duyệt" */
        requireSignature: !!myTask && !!currentNode?.options.requireSignature,
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
      populate: ["requestTypeVersion", "requester", "department", "category"],
      sort: { updatedAt: "DESC" },
    });
    const rows = serialize(result.data, { populate: ["requestTypeVersion", "requester", "department", "category"], forceObject: true });
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
    const request = await this.repo.findOne({ id, deleted: { $ne: true } });
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

  /** Tệp đang soạn của một loại (vòng round + 1), dạng ghi lịch sử */
  private async draftFileItems(request: ApprovalRequestEntity, block: RequestFileCategory): Promise<FileChangeItem[]> {
    const rows = await loadRequestFiles(this.em, request.id, draftRound(request), block);
    return rows.map((row) => ({ id: row.original.id, filename: row.original.filename, block }));
  }

  /** Tên phòng ban lúc ghi lịch sử: đổi tên phòng về sau thì dòng lịch sử cũ vẫn đọc đúng như thời điểm sửa */
  private async departmentBriefs(ids: string[]) {
    const departments = await this.em.find(DepartmentEntity, { id: { $in: ids } }, { fields: ["id", "name"] });
    return new Map(departments.map((d) => [d.id, { id: d.id, name: d.name }]));
  }

  /** Đặt tệp đang soạn của một loại theo đúng thứ tự ids; trả về danh sách mới (tệp + dạng ghi lịch sử) */
  private async setFiles(request: ApprovalRequestEntity, field: RequestFileCategory, rawIds: string[]) {
    const ids = [...new Set(rawIds)];
    const files = ids.length
      ? await this.em.find(AttachmentEntity, { id: { $in: ids }, deleted: { $ne: true }, status: AttachmentStatus.Ready })
      : [];
    const userId = this.getCurrentUser().id;
    // Chỉ gắn tệp do chính người dùng upload và nằm đúng thư mục của phiếu + loại tệp (vòng nào cũng được):
    // chặn việc gắn tệp (private) của người khác hoặc của phiếu khác để xin link tải
    if (files.length !== ids.length || files.some((f) => f.createdBy.id !== userId || !isRequestFileKey(f.key, request.id, field))) {
      throw new BadRequestException("Some files are invalid");
    }
    const ordered = ids.map((id) => files.find((f) => f.id === id));
    const owner = this.em.getReference(UserEntity, userId);
    await setRequestFiles(this.em, request, field, ordered, { createdBy: owner, updatedBy: owner });
    const items: FileChangeItem[] = ordered.map((f) => ({ id: f.id, filename: f.filename, block: field }));
    return { files: ordered, items };
  }

  /**
   * Bộ tệp đang soạn phải đúng cấu hình (bắt buộc, số tệp, loại, dung lượng) ngay cả khi chỉ lưu nháp,
   * giống các trường bắt buộc của form; gửi đi vẫn kiểm lại. Gọi trước flush: lỗi thì không lưu gì.
   */
  private assertDraftFiles(attachmentConfig: unknown, files: { documents: AttachmentEntity[]; attachments: AttachmentEntity[] }) {
    const error = requestFilesError(attachmentConfig, files);
    if (error) throw new BadRequestException(`Invalid files: ${error}`);
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

    // Tệp đang soạn thuộc vòng sắp gửi: phiếu mới / nháp → vòng 1, bị trả lại ở vòng n → vòng n + 1
    const folder = buildRequestFileFolder(requestId, (existing?.round ?? 0) + 1, data.category);
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
