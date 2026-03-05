import { EntityData, EntityField, FromEntityType, RequiredEntityData, wrap } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/mongodb";
import { Inject, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { BaseEntity } from "./base.entity";

export interface PaginationQuery<T> {
  page?: number;
  limit?: number;
  fields?: readonly EntityField<T>[];
  populate?: readonly EntityField<T>[];
}

interface IUser {
  id: string;
}
export abstract class BaseService<T extends BaseEntity> {
  private readonly baseLogger = new Logger(BaseService.name);

  public constructor(
    protected readonly repo: EntityRepository<T>,
    @Inject(REQUEST) protected readonly request: (Request & { user?: IUser }) | undefined
  ) {
    // Empty
  }

  /* ================= CURRENT USER ================= */
  getCurrentUser(options?: { user?: IUser }): IUser {
    const user = this.request?.user || options?.user;
    if (!user) {
      throw new InternalServerErrorException("User not found in request context");
    }
    return user;
  }

  /* ================= CREATE ================= */
  async addOne(data: RequiredEntityData<T>, options?: { user?: IUser }): Promise<T> {
    const { id } = this.getCurrentUser(options);
    const entity = this.repo.create({ ...data, createdBy: id, updatedBy: id });
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
  async findOne(
    filter: FilterQuery<T>,
    dataQuery: { fields?: readonly EntityField<T>[]; populate?: readonly EntityField<T>[] }
  ): Promise<T> {
    const { fields = ["id"], populate = [] } = dataQuery || {};
    const entity = await this.repo.findOne(filter, { fields: fields as never[], populate: populate as never[] });

    return entity;
  }

  /* ================= FIND BY ID ================= */
  async findById(id: string): Promise<T> {
    const entity = await this.repo.findOne({
      id,
    } as FilterQuery<T>);

    if (!entity) {
      throw new NotFoundException(`${this.repo.getEntityName()} not found`);
    }

    return entity;
  }

  /* ================= UPDATE ================= */
  async update(id: string, data: EntityData<FromEntityType<T>>, options?: { user?: IUser }): Promise<T> {
    const entity = await this.findById(id);
    const { id: userId } = this.getCurrentUser(options);
    wrap(entity).assign({
      ...data,
      updatedBy: userId,
    } as any);

    await this.repo.getEntityManager().flush();

    return entity;
  }

  /* ================= SOFT DELETE ================= */
  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.findById(id);

    this.repo.assign(entity, { deleted: true } as any);
    await this.repo.getEntityManager().flush();

    return { message: "Deleted successfully" };
  }
}
