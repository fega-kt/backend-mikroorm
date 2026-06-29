import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { EntityRepository, FilterQuery, RequiredEntityData } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { ActivityLogAction, ActivityLogEntity } from "../entity/activity-log.entity";

@Injectable({ scope: Scope.REQUEST })
export class ActivityLogService extends BaseService<ActivityLogEntity> {
  constructor(
    @InjectRepository(ActivityLogEntity)
    protected readonly repo: EntityRepository<ActivityLogEntity>,
  ) {
    super();
  }

  async addOne(data: RequiredEntityData<ActivityLogEntity>, options?: { user?: IUserResponse }) {
    const ip = this.request?.ip || "N/A";
    const device = this.request?.headers["user-agent"] || "N/A";
    return super.addOne({ ...data, ip, device }, options);
  }

  findByParent(parentId: string, page: number, limit: number, action?: ActivityLogAction) {
    const where: FilterQuery<ActivityLogEntity> = { parentId, deleted: { $ne: true } };
    if (action) where.action = action;

    return this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "parentId",
        "action",
        "type",
        "oldData",
        "newData",
        "ip",
        "device",
        "createdAt",
        "createdBy",
        "createdBy.id",
        "createdBy.fullName",
        "createdBy.avatar",
      ],
      populate: ["createdBy"],
      sort: { createdAt: "DESC" },
    });
  }
}
