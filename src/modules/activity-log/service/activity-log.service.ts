import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { RequiredEntityData } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { ActivityLogEntity } from "../entity/activity-log.entity";

@Injectable({ scope: Scope.REQUEST })
export class ActivityLogService extends BaseService<ActivityLogEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(ActivityLogEntity)
    private readonly userRepo: EntityRepository<ActivityLogEntity>
  ) {
    super(userRepo, request);
  }

  async addOne(data: RequiredEntityData<ActivityLogEntity>, options?: { user?: IUserResponse }) {
    const ip = this.request?.ip || "N/A";
    const device = this.request?.headers["user-agent"] || "N/A";

    return super.addOne({ ...data, ip, device }, options);
  }
}
