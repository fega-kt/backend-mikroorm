import {
  EntityData,
  EntityRepository,
  FilterQuery,
  FindOneOptions,
  FindOptions,
  FromEntityType,
  Loaded,
  QueryOrderMap,
  RequiredEntityData,
} from "@mikro-orm/core";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { UserEntity } from "@core-service/entities/user";
import { Inject, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { BaseEntity } from "./base.entity";
import { IUserResponse } from "./consts";
import { EntityPath } from "./entity-path.type";

export interface PaginationQuery<T> {
  page?: number;
  limit?: number;
  fields?: readonly EntityPath<T>[];
  populate?: readonly EntityPath<T>[];
  sort?: QueryOrderMap<T>;
  disableIdentityMap?: boolean;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v as unknown;
  });
}

export abstract class BaseService<T extends BaseEntity> {
  @Inject(REQUEST)
  protected readonly request: Request | undefined;

  @Inject(CACHE_SERVICE)
  protected readonly cache: ICacheService;

  protected abstract readonly repo: EntityRepository<T>;

  protected readonly cacheTTL = { item: 300, list: 120 };

  /* ================= CACHE HELPERS ================= */
  protected get cachePrefix(): string {
    return this.repo.getEntityName().toLowerCase().replace("entity", "");
  }

  protected cacheKey(id: string): string {
    return `cache:${this.cachePrefix}:${id}`;
  }

  protected cacheListKey(filter: object): string {
    return `cache:${this.cachePrefix}:list:${stableStringify(filter)}`;
  }

  /* ================= CURRENT USER ================= */
  getCurrentUser(options?: { user?: IUserResponse }): IUserResponse {
    // options.user takes priority — allows system/override callers to bypass request context
    const user = options?.user ?? this.request?.user;
    if (!user) {
      throw new InternalServerErrorException("User not found in request context");
    }
    return user;
  }

  getDefaultValuesForCreate(options?: { user?: IUserResponse }) {
    const { id } = this.getCurrentUser(options);
    const em = this.repo.getEntityManager();
    return {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: em.getReference(UserEntity, id),
      updatedBy: em.getReference(UserEntity, id),
    };
  }

  getDefaultValuesForUpdate(options?: { user?: IUserResponse }) {
    const { id } = this.getCurrentUser(options);
    const em = this.repo.getEntityManager();
    return {
      updatedAt: new Date(),
      updatedBy: em.getReference(UserEntity, id),
    };
  }

  /* ================= CREATE ================= */
  async addOne(data: RequiredEntityData<T>, options?: { user?: IUserResponse }): Promise<T> {
    const baseCreate = this.getDefaultValuesForCreate(options);
    const entity = this.repo.create({ ...data, ...baseCreate });
    const em = this.repo.getEntityManager();
    em.persist(entity);
    await em.flush();
    await this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`);
    return entity;
  }

  /* ================= FIND ALL ================= */
  async findAll(filter: FilterQuery<T> = {}, query: PaginationQuery<T> = {}) {
    const { page = 1, limit, fields = ["id"], populate = [], sort, disableIdentityMap = true } = query;

    const data = await this.repo.find(filter, {
      fields,
      populate,
      orderBy: sort,
      disableIdentityMap,
      ...(limit && { limit, offset: (page - 1) * limit }),
    } as FindOptions<T>);

    return { data, page, limit };
  }

  /* ================= PAGINATE ================= */
  async paginate(filter: FilterQuery<T> = {}, query: PaginationQuery<T> = {}) {
    const { page = 1, limit = 10, fields = ["id"], populate = [], sort, disableIdentityMap } = query;

    const [data, total] = await this.repo.findAndCount(filter, {
      limit,
      offset: (page - 1) * limit,
      fields,
      populate,
      orderBy: sort,
      disableIdentityMap,
    } as FindOptions<T>);

    return { data, total, page, limit };
  }

  /* ================= FIND ONE ================= */
  async findOne<P extends string = never, F extends string = "*">(
    filter: FilterQuery<T>,
    options?: FindOneOptions<T, P, F>,
  ): Promise<Loaded<T, P, F> | null> {
    return this.repo.findOne<P, F>(filter, options);
  }

  /* ================= FIND BY ID ================= */
  async findById(id: string): Promise<T> {
    const entity = await this.repo.findOne({ id } as FilterQuery<T>);

    if (!entity) {
      throw new NotFoundException(`${this.repo.getEntityName()} not found`);
    }

    return entity;
  }

  /* ================= UPDATE ================= */
  async updateOne(id: string, data: EntityData<FromEntityType<T>>, options?: { user?: IUserResponse }): Promise<T> {
    const baseUpdate = this.getDefaultValuesForUpdate(options);
    // Dùng repo.findOne trực tiếp để đảm bảo entity được quản lý bởi EM (không dùng cached plain object)
    const entity = await this.repo.findOne({ id } as FilterQuery<T>);
    if (!entity) throw new NotFoundException(`${this.repo.getEntityName()} not found`);

    Object.assign(entity, data, baseUpdate);
    await this.repo.getEntityManager().flush();

    await Promise.all([this.cache.del(this.cacheKey(id)), this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`)]);

    return entity;
  }

  /* ================= SOFT DELETE ================= */
  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ id, deleted: { $ne: true } } as FilterQuery<T>);

    if (!entity) {
      throw new NotFoundException(`${this.repo.getEntityName()} not found or already deleted`);
    }

    entity.deleted = true;
    await this.repo.getEntityManager().flush();

    await Promise.all([this.cache.del(this.cacheKey(id)), this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`)]);

    return { message: "Deleted successfully" };
  }
}
