import { EntityData, EntityField, RequiredEntityData, wrap } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/mongodb";
import { Logger, NotFoundException } from "@nestjs/common";
import { BaseEntity } from "./base.entity";

export interface PaginationQuery<T> {
  page?: number;
  limit?: number;
  fields?: readonly EntityField<T>[];
  populate?: readonly EntityField<T>[];
}
export abstract class BaseService<T extends BaseEntity> {
  private readonly baseLogger = new Logger(BaseService.name);

  public constructor(protected readonly repo: EntityRepository<T>, protected request?: Request) {
    // Empty
  }

  /* ================= CURRENT USER ================= */

  /* ================= CREATE ================= */
  async create(data: RequiredEntityData<T>): Promise<T> {
    const entity = this.repo.create(data);
    await this.repo.getEntityManager().persistAndFlush(entity);
    return entity;
  }

  /* ================= FIND ALL ================= */
  async findAll(filter: FilterQuery<T> = {}, query: PaginationQuery<T> = {}) {
    const { page = 1, limit = 10, fields = ["id"], populate = [] } = query;

    const [data, total] = await this.repo.findAndCount(filter, {
      limit,
      offset: (page - 1) * limit,
      fields: fields as never[],
      populate: populate as never[],
      disableIdentityMap: true,
    });

    return { data, total, page, limit };
  }

  /* ================= FIND ONE ================= */
  async findOne(id: string): Promise<T> {
    const entity = await this.repo.findOne({
      id,
    } as FilterQuery<T>);

    if (!entity) {
      throw new NotFoundException(`${this.repo.getEntityName()} not found`);
    }

    return entity;
  }

  /* ================= UPDATE ================= */
  async update(
    id: string,
    data: EntityData<T> // không cần UpdateDto nữa
  ): Promise<T> {
    const entity = await this.findOne(id);

    wrap(entity).assign(data as any);

    await this.repo.getEntityManager().flush();

    return entity;
  }

  /* ================= SOFT DELETE ================= */
  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.findOne(id);

    this.repo.assign(entity, { deleted: true } as any);
    await this.repo.getEntityManager().flush();

    return { message: "Deleted successfully" };
  }
}
