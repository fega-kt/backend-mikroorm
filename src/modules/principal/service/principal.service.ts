import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { PrincipalEntity } from "../entity/principal.entity";

@Injectable()
export class PrincipalService extends BaseService<PrincipalEntity> {
  constructor(
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
  ) {
    super(principalRepo, request);
  }

  async findAllPrincipal(page = 1, limit = 10, keyword?: string) {
    const filter: FilterQuery<PrincipalEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = new RegExp(keyword, "i");
    }

    const { data, total } = await this.paginate(filter, {
      page,
      limit,
      populate: ["user", "group"],
      fields: ["id", "name", "type", "description", "user", "group"],
    });

    return { data, total };
  }
}
