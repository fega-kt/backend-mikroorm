import { EntityData, EntityField, FindOptions, FromEntityType, RequiredEntityData, wrap } from "@mikro-orm/core";
import { EntityRepository, FilterQuery, ObjectId } from "@mikro-orm/mongodb";
import { Inject, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { BaseEntity } from "./base.entity";
import { IUserResponse } from "./consts";

export interface PaginationQuery<T> {
  page?: number;
  limit?: number;
  fields?: readonly EntityField<T>[];
  populate?: readonly EntityField<T>[];
}

export abstract class BaseService<T extends BaseEntity> {
  private readonly baseLogger = new Logger(BaseService.name);

  public constructor(
    protected readonly repo: EntityRepository<T>,
    @Inject(REQUEST) protected readonly request: Request | undefined,
  ) {
    // Empty
  }

  /* ================= CURRENT USER ================= */
  getCurrentUser(options?: { user?: IUserResponse }): IUserResponse {
    const user = this.request?.user || options?.user;
    if (!user) {
      throw new InternalServerErrorException("User not found in request context");
    }
    return user;
  }

  getDefaultValuesForCreate(options?: { user?: IUserResponse }) {
    const { id } = this.getCurrentUser(options);
    return {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: new ObjectId(id),
      updatedBy: new ObjectId(id),
    };
  }

  getDefaultValuesForUpdate(options?: { user?: IUserResponse }) {
    const { id } = this.getCurrentUser(options);
    return {
      updatedAt: new Date(),
      updatedBy: new ObjectId(id),
    };
  }

  /* ================= CREATE ================= */
  async addOne(data: RequiredEntityData<T>, options?: { user?: IUserResponse }): Promise<T> {
    const baseCreate = this.getDefaultValuesForCreate(options);
    const entity = this.repo.create({ ...data, ...baseCreate });
    await this.repo.getEntityManager().persistAndFlush(entity);
    return entity;
  }

  /* ================= FIND ALL ================= */
  async findAll(filter: FilterQuery<T> = {}, query: PaginationQuery<T> = {}) {
    const { page = 1, limit, fields = ["id"], populate = [] } = query;

    const options: FindOptions<T> = {
      fields: fields as never[],
      populate: populate as never[],
      disableIdentityMap: true,
    };

    if (limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const data = await this.repo.find(filter, options);

    return {
      data,
      page,
      limit,
    };
  }

  /* ================= PAGINATE ================= */
  async paginate(filter: FilterQuery<T> = {}, query: PaginationQuery<T> = {}) {
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
    dataQuery: { fields?: readonly EntityField<T>[]; populate?: readonly EntityField<T>[] },
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
  async updateOne(id: string, data: EntityData<FromEntityType<T>>, options?: { user?: IUserResponse }): Promise<T> {
    const baseUpdate = this.getDefaultValuesForUpdate(options);
    const entity = await this.findById(id);

    wrap(entity).assign({
      ...data,
      ...baseUpdate,
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
