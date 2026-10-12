import { BaseService } from "@common/base/base.service";
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

const POPULATE = ["fromUser", "toUser", "requestType"] as const;

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
    if (tab === "mine") where.fromUser = userId;
    else where.toUser = userId;
    if (activeOnly) where.endAt = { $gte: new Date() };

    const result = await this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "startAt",
        "endAt",
        "reason",
        "createdAt",
        "fromUser.id",
        "fromUser.fullName",
        "fromUser.avatar",
        "toUser.id",
        "toUser.fullName",
        "toUser.avatar",
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
    await this.ensureDelegate(data.toUser, userId);
    const delegation = await this.addOne({
      fromUser: this.em.getReference(UserEntity, userId),
      toUser: this.em.getReference(UserEntity, data.toUser),
      startAt: data.startAt,
      endAt: data.endAt,
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

  private async getOwn(id: string) {
    const delegation = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!delegation) throw new NotFoundException("Delegation not found");
    if (delegation.fromUser.id !== this.getCurrentUser().id) throw new ForbiddenException("You cannot change this delegation");
    return delegation;
  }

  private async ensureDelegate(toUserId: string, fromUserId: string) {
    if (toUserId === fromUserId) throw new BadRequestException("Cannot delegate to yourself");
    const active = await this.em.count(UserEntity, { id: toUserId, isActive: true, deleted: { $ne: true } });
    if (!active) throw new BadRequestException("Delegate is not an active user");
  }
}
