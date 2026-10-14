import { BaseService } from "@common/base/base.service";
import { PermissionType } from "@common/base/permission-type.enum";
import { UserEntity } from "@core-service/entities/user";
import { EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type {
  ApprovalDelegationFilterDto,
  CreateApprovalDelegationDto,
  UpdateApprovalDelegationDto,
} from "../../controllers/approval-delegation/approval-delegation.validation";
import { ApprovalDelegationEntity } from "../../entities/approval-delegation";
import { RequestTypeEntity } from "../../entities/request-type";

const POPULATE = ["fromUser", "toUser", "createdBy", "requestType"] as const;

@Injectable({ scope: Scope.REQUEST })
export class ApprovalDelegationService extends BaseService<ApprovalDelegationEntity> {
  constructor(
    @InjectRepository(ApprovalDelegationEntity)
    protected readonly repo: EntityRepository<ApprovalDelegationEntity>,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  async getDelegations(filter: ApprovalDelegationFilterDto) {
    const userId = this.getCurrentUser().id;
    const { page, limit, tab, activeOnly } = filter;
    const where: FilterQuery<ApprovalDelegationEntity> = { deleted: { $ne: true } };
    if (tab === "all") {
      if (!this.canManage()) throw new ForbiddenException("You cannot view all delegations");
    } else if (tab === "mine") where.fromUser = userId;
    else where.toUser = userId;
    if (activeOnly) where.endAt = { $gte: new Date() };

    const result = await this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "startAt",
        "endAt",
        "mode",
        "reason",
        "createdAt",
        "fromUser.id",
        "fromUser.fullName",
        "fromUser.avatar",
        "toUser.id",
        "toUser.fullName",
        "toUser.avatar",
        "createdBy.id",
        "createdBy.fullName",
        "createdBy.avatar",
        "requestType.id",
        "requestType.name",
      ],
      populate: [...POPULATE],
      sort: { startAt: "DESC" },
    });
    return { ...result, data: serialize(result.data, { populate: [...POPULATE], forceObject: true }) };
  }

  async getDelegation(id: string) {
    const delegation = await this.getOwn(id);
    await this.em.populate(delegation, [...POPULATE]);
    return serialize(delegation, { populate: [...POPULATE], forceObject: true });
  }

  async createDelegation(data: CreateApprovalDelegationDto) {
    const userId = this.getCurrentUser().id;
    // Tạo hộ người khác (vd: HR cho giám đốc) cần quyền quản lý ủy quyền
    const fromUserId = data.fromUser || userId;
    if (fromUserId !== userId) {
      if (!this.canManage()) throw new ForbiddenException("You cannot create delegations for other users");
      await this.ensureActiveUser(fromUserId, "Delegator is not an active user");
    }
    await this.ensureDelegate(data.toUser, fromUserId);
    const delegation = await this.addOne({
      fromUser: this.em.getReference(UserEntity, fromUserId),
      toUser: this.em.getReference(UserEntity, data.toUser),
      startAt: data.startAt,
      endAt: data.endAt,
      mode: data.mode,
      requestType: data.requestType ? this.em.getReference(RequestTypeEntity, data.requestType) : undefined,
      reason: data.reason ?? undefined,
    });
    return { id: delegation.id };
  }

  async updateDelegation(id: string, data: UpdateApprovalDelegationDto) {
    const delegation = await this.getOwn(id);
    if (data.toUser) await this.ensureDelegate(data.toUser, delegation.fromUser.id);
    const startAt = data.startAt ?? delegation.startAt;
    const endAt = data.endAt ?? delegation.endAt;
    if (endAt <= startAt) throw new BadRequestException("End time must be after start time");
    this.em.assign(delegation, {
      startAt,
      endAt,
      ...(data.mode && { mode: data.mode }),
      ...(data.toUser && { toUser: this.em.getReference(UserEntity, data.toUser) }),
      ...(data.requestType !== undefined && {
        requestType: data.requestType ? this.em.getReference(RequestTypeEntity, data.requestType) : null,
      }),
      ...(data.reason !== undefined && { reason: data.reason ?? null }),
      ...this.getDefaultValuesForUpdate(),
    });
    await this.em.flush();
    return { id };
  }

  async deleteDelegation(id: string) {
    await this.getOwn(id);
    return this.remove(id);
  }

  /** Ủy quyền mà người dùng được sửa / xóa: của chính mình, hoặc mọi ủy quyền nếu có quyền quản lý */
  private async getOwn(id: string) {
    const delegation = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!delegation) throw new NotFoundException("Delegation not found");
    if (delegation.fromUser.id !== this.getCurrentUser().id && !this.canManage()) {
      throw new ForbiddenException("You cannot change this delegation");
    }
    return delegation;
  }

  private canManage() {
    return this.getCurrentUser().canAccess([PermissionType.ManageApprovalDelegation]);
  }

  private async ensureDelegate(toUserId: string, fromUserId: string) {
    if (toUserId === fromUserId) throw new BadRequestException("Cannot delegate to yourself");
    await this.ensureActiveUser(toUserId, "Delegate is not an active user");
  }

  private async ensureActiveUser(id: string, message: string) {
    const active = await this.em.count(UserEntity, { id, isActive: true, deleted: { $ne: true } });
    if (!active) throw new BadRequestException(message);
  }
}
