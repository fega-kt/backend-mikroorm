import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable } from "@nestjs/common";

import { BaseService } from "@common/base/base.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";

@Injectable()
export class AuthService extends BaseService<UserEntity> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @Inject(REQUEST) protected request: Request | undefined
  ) {
    super(userRepo, request);
  }
}
