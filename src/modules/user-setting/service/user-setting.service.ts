import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";

import { BaseService } from "@common/base/base.service";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { UserSettingEntity } from "../entity/user-setting.entity";

@Injectable({ scope: Scope.REQUEST })
export class UserSettingService extends BaseService<UserSettingEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(UserSettingEntity)
    private readonly userSettingRepo: EntityRepository<UserSettingEntity>
  ) {
    super(userSettingRepo, request);
  }
}
