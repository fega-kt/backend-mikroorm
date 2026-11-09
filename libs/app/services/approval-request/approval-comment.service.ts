import { BaseService } from "@common/base/base.service";
import { PermissionType } from "@common/base/permission-type.enum";
import { UserEntity } from "@core-service/entities/user";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type {
  ApprovalCommentFilterDto,
  CreateApprovalCommentDto,
  UpdateApprovalCommentDto,
} from "../../controllers/approval-request/approval-request.validation";
import { ApprovalCommentEntity } from "../../entities/approval-comment";
import { ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskEntity } from "../../entities/approval-task";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { buildTaskAccess } from "../approval-engine/task-access";
import { buildCommentThreads, MAX_COMMENT_DEPTH } from "./comment-thread";
import { isRequestParticipant, isRequestSharedWith } from "./request-access";

const userBrief = (u?: Pick<UserEntity, "id" | "fullName" | "avatar"> | null) =>
  u ? { id: u.id, fullName: u.fullName, avatar: u.avatar } : null;

/**
 * Bình luận trong tờ trình.
 * - Xem: đúng như xem tờ trình — người trình, người tham gia duyệt, người được chia sẻ, hoặc có quyền xem mọi tờ trình.
 * - Viết: người trình, người tham gia duyệt (mọi vòng). Người chỉ được chia sẻ và người xem qua quyền xem mọi tờ trình
 *   không viết được; phiếu nháp chưa có ai khác nên không bình luận.
 * - @mention: chỉ người đã có mặt trong tờ trình (trình / tham gia duyệt / được chia sẻ), không tự chia sẻ thêm cho ai.
 * - Sửa / xóa: chỉ tác giả.
 */
@Injectable({ scope: Scope.REQUEST })
export class ApprovalCommentService extends BaseService<ApprovalCommentEntity> {
  constructor(
    @InjectRepository(ApprovalCommentEntity)
    protected readonly repo: EntityRepository<ApprovalCommentEntity>,
    private readonly engine: ApprovalEngineService,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  /** Đơn + toàn bộ task (mọi vòng) để xét ai có mặt trong tờ trình */
  private async loadContext(requestId: string) {
    const request = await this.em.findOne(ApprovalRequestEntity, { id: requestId, deleted: { $ne: true } }, { populate: ["requester"] });
    if (!request) throw new NotFoundException("Request not found");
    const tasks = await this.em.find(
      ApprovalTaskEntity,
      { request: requestId },
      { populate: ["approver", "approver.user", "originApprover", "originApprover.user", "actedBy", "handoverDelegations"] },
    );
    return { request, tasks };
  }

  private scope(request: ApprovalRequestEntity) {
    return { requesterId: request.requester.id, requestTypeId: request.requestType.id };
  }

  /** Người trình / người tham gia duyệt (không tính người chỉ được chia sẻ) */
  private async isInvolved(request: ApprovalRequestEntity, tasks: ApprovalTaskEntity[], userId: string) {
    if (request.requester.id === userId) return true;
    const access = await buildTaskAccess(this.em, tasks, this.scope(request), userId);
    return isRequestParticipant(tasks, userId, access);
  }

  private async isShared(request: ApprovalRequestEntity, tasks: ApprovalTaskEntity[], userId: string) {
    const access = await buildTaskAccess(this.em, tasks, this.scope(request), userId);
    return isRequestSharedWith(this.em, request.id, userId, access);
  }

  async list(requestId: string, filter: ApprovalCommentFilterDto) {
    const user = this.getCurrentUser();
    const { request, tasks } = await this.loadContext(requestId);
    const canView =
      (await this.isInvolved(request, tasks, user.id)) ||
      (await this.isShared(request, tasks, user.id)) ||
      user.canAccess([PermissionType.MenuAllApprovalRequest]);
    if (!canView) throw new ForbiddenException("You cannot view this request");

    const where: FilterQuery<ApprovalCommentEntity> = { request: requestId, parent: null };
    if (filter.round !== undefined) where.round = filter.round;
    const [roots, total] = await this.em.findAndCount(ApprovalCommentEntity, where, {
      populate: ["createdBy", "mentions"],
      // Bình luận gốc: mới nhất lên đầu (phân trang theo thứ tự này); phản hồi bên dưới vẫn cũ trước, mới sau
      orderBy: { createdAt: "DESC", id: "DESC" },
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });
    // Mọi bình luận bên dưới các gốc, lấy lần lượt từng tầng (kể cả đã xóa: bình luận giữa còn con thì giữ chỗ)
    const descendants: ApprovalCommentEntity[] = [];
    let frontier = roots.map((r) => r.id);
    for (let depth = 0; frontier.length && depth < MAX_COMMENT_DEPTH - 1; depth++) {
      const level = await this.em.find(
        ApprovalCommentEntity,
        { parent: { $in: frontier } },
        { populate: ["createdBy", "mentions"], orderBy: { createdAt: "ASC", id: "ASC" } },
      );
      descendants.push(...level);
      frontier = level.map((c) => c.id);
    }

    const toRow = (c: ApprovalCommentEntity) => ({
      id: c.id,
      parentId: c.parent?.id ?? null,
      round: c.round,
      content: c.content,
      mentions: c.deleted ? [] : c.mentions.getItems().map((u) => userBrief(u)),
      author: userBrief(c.createdBy),
      createdAt: c.createdAt,
      editedAt: c.editedAt ?? null,
      deleted: c.deleted,
      canEdit: !c.deleted && c.createdBy.id === user.id,
    });
    return { data: buildCommentThreads(roots.map(toRow), descendants.map(toRow)), total, page: filter.page, limit: filter.limit };
  }

  async create(requestId: string, data: CreateApprovalCommentDto) {
    const user = this.getCurrentUser();
    const { request, tasks } = await this.loadContext(requestId);
    if (request.status === ApprovalRequestStatus.Draft) throw new ConflictException("Draft requests cannot be commented on");
    if (!(await this.isInvolved(request, tasks, user.id))) throw new ForbiddenException("You cannot comment on this request");
    await this.assertMentionable(request, tasks, data.mentionIds);

    const comment = await this.engine.addComment(requestId, user.id, data);
    return { id: comment.id };
  }

  async update(requestId: string, commentId: string, data: UpdateApprovalCommentDto) {
    const comment = await this.ownComment(requestId, commentId);
    comment.content = data.content;
    comment.editedAt = new Date();
    comment.updatedBy = this.em.getReference(UserEntity, this.getCurrentUser().id);
    await this.em.flush();
    return { id: comment.id };
  }

  async removeComment(requestId: string, commentId: string) {
    const comment = await this.ownComment(requestId, commentId);
    comment.deleted = true;
    comment.updatedBy = this.em.getReference(UserEntity, this.getCurrentUser().id);
    await this.em.flush();
  }

  /** Bình luận chưa xóa của chính người dùng hiện tại trong đúng tờ trình */
  private async ownComment(requestId: string, commentId: string) {
    const comment = await this.em.findOne(
      ApprovalCommentEntity,
      { id: commentId, request: requestId, deleted: { $ne: true } },
      { populate: ["createdBy"] },
    );
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.createdBy.id !== this.getCurrentUser().id) throw new ForbiddenException("You can only change your own comments");
    return comment;
  }

  /** Mỗi người được nhắc phải đã có mặt trong tờ trình (nhắc người chưa xem được thì chặn, không tự chia sẻ) */
  private async assertMentionable(request: ApprovalRequestEntity, tasks: ApprovalTaskEntity[], mentionIds: string[]) {
    for (const id of new Set(mentionIds)) {
      const present = (await this.isInvolved(request, tasks, id)) || (await this.isShared(request, tasks, id));
      if (!present) throw new BadRequestException(`User ${id} cannot view this request and cannot be mentioned`);
    }
  }
}
