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
import { LIST_CACHE_TTL, LIST_CACHE_VERSION } from "@common/constants/list-cache.constant";
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

/** Tham số tìm theo chuỗi: request có các tham số này dùng TTL ngắn (LIST_CACHE_TTL.SEARCH) */
const SEARCH_PARAMS = new Set(["search", "keyword", "name", "code", "fullName", "phoneNumber", "description"]);

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

  /**
   * Bật cache danh sách (cachedList): ttl tính bằng giây; dependents là prefix list của entity khác có hiển thị
   * dữ liệu của entity này (vd: list user hiện tên phòng ban) — ghi entity này thì xóa luôn list của chúng.
   */
  protected readonly listCache?: { ttl: number; dependents?: readonly string[] };

  /* ================= CACHE HELPERS ================= */
  protected get cachePrefix(): string {
    return this.repo.getEntityName().toLowerCase().replace("entity", "");
  }

  /** Tên bảng của entity, dùng làm parentType cho activity log */
  protected get tableName(): string {
    return this.repo.getEntityManager().getMetadata().get(this.repo.getEntityName()).tableName;
  }

  protected cacheKey(id: string): string {
    return `cache:${this.cachePrefix}:${id}`;
  }

  /** scope phân biệt các method list khác nhau của cùng entity (vd: list phẳng và cây phòng ban) */
  protected cacheListKey(scope: string, filter: object): string {
    return `cache:${this.cachePrefix}:list:${LIST_CACHE_VERSION}:${scope}:${stableStringify(filter)}`;
  }

  /**
   * Đọc danh sách qua cache; params phải chứa mọi thứ ảnh hưởng tới kết quả (phân trang, bộ lọc...).
   * Kết quả lưu dạng JSON nên loader phải trả dữ liệu hiển thị (entity đã nạp đủ hoặc object thường), không dùng tiếp như entity.
   */
  protected async cachedList<R>(scope: string, params: object, loader: () => Promise<R>): Promise<R> {
    if (!this.listCache) return loader();

    const key = this.cacheListKey(scope, params);
    const cached = await this.cache.get<R>(key);
    if (cached !== null) return cached;

    const result = await loader();
    const searching = Object.entries(params).some(([name, value]) => SEARCH_PARAMS.has(name) && value);
    await this.cache.set(key, result, searching ? Math.min(this.listCache.ttl, LIST_CACHE_TTL.SEARCH) : this.listCache.ttl);
    return result;
  }

  /** Xóa cache list của entity này và các list phụ thuộc; gọi sau mọi thao tác ghi không đi qua addOne/updateOne/remove */
  protected async invalidateLists(): Promise<void> {
    if (!this.listCache) return;
    const prefixes = [this.cachePrefix, ...(this.listCache.dependents ?? [])];
    await Promise.all(prefixes.map((prefix) => this.cache.delByPattern(`cache:${prefix}:list:*`)));
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
    await this.invalidateLists();
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

    await Promise.all([this.cache.del(this.cacheKey(id)), this.invalidateLists()]);

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

    await Promise.all([this.cache.del(this.cacheKey(id)), this.invalidateLists()]);

    return { message: "Deleted successfully" };
  }
}
