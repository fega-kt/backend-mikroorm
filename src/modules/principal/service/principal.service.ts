import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { PrincipalEntity } from "../entity/principal.entity";

@Injectable()
export class PrincipalService extends BaseService<PrincipalEntity> {
  constructor(
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
    @Inject(REQUEST) protected request: Request | undefined
  ) {
    super(principalRepo, request);
  }
}
