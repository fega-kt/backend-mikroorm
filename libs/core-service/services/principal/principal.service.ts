import { BaseService } from "@common/base/base.service";
import { LIST_CACHE_TTL } from "@common/constants/list-cache.constant";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { PrincipalEntity } from "../../entities/principal";

@Injectable({ scope: Scope.REQUEST })
export class PrincipalService extends BaseService<PrincipalEntity> {
  protected readonly listCache = { ttl: LIST_CACHE_TTL.DYNAMIC };

  constructor(
    @InjectRepository(PrincipalEntity)
    protected readonly repo: EntityRepository<PrincipalEntity>,
  ) {
    super();
  }

  findAllPrincipal(page = 1, limit = 10, keyword?: string) {
    return this.cachedList("page", { page, limit, keyword }, () => this.loadList(page, limit, keyword));
  }

  private async loadList(page: number, limit: number, keyword?: string) {
    const filter: FilterQuery<PrincipalEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = { $ilike: `%${keyword}%` };
    }

    const { data, total } = await this.paginate(filter, {
      page,
      limit,
      populate: ["user", "group"],
      fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
      sort: { updatedAt: "DESC" },
    });

    return { data, total };
  }

  /** Một principal (người dùng hoặc nhóm) — dùng để hiện tên người duyệt trong quy trình */
  async getPrincipalById(id: string) {
    const principal = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      {
        populate: ["user", "group"],
        fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
      },
    );
    if (!principal) throw new NotFoundException("Principal not found");
    return principal;
  }
}
