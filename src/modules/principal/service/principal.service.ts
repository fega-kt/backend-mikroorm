import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { PrincipalEntity } from "../entity/principal.entity";

@Injectable({ scope: Scope.REQUEST })
export class PrincipalService extends BaseService<PrincipalEntity> {
  constructor(
    @InjectRepository(PrincipalEntity)
    protected readonly repo: EntityRepository<PrincipalEntity>,
  ) {
    super();
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
      fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
    });

    return { data, total };
  }
}
