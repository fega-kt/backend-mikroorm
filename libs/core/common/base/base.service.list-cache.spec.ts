import { ApprovalWorkflowEntity } from "@app-domain/entities/approval-workflow";
import { CategoryEntity } from "@app-domain/entities/category";
import { FormEntity } from "@app-domain/entities/form";
import { RequestTypeEntity } from "@app-domain/entities/request-type";
import { LIST_CACHE, LIST_CACHE_TTL, LIST_CACHE_VERSION } from "@common/constants/list-cache.constant";
import { AppSettingEntity } from "@core-service/entities/app-setting";
import { DepartmentEntity } from "@core-service/entities/department";
import { GroupEntity } from "@core-service/entities/group";
import { PrincipalEntity } from "@core-service/entities/principal";
import { RoleEntity } from "@core-service/entities/role";
import { UserEntity } from "@core-service/entities/user";
import { type EntityRepository } from "@mikro-orm/core";
import { type ICacheService } from "@modules/cache/cache.interface";
import { describe, expect, it } from "vitest";
import { type BaseEntity } from "./base.entity";
import { BaseService } from "./base.service";

class MemoryCache implements ICacheService {
  readonly store = new Map<string, { value: string; ttl: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    return hit ? (JSON.parse(hit.value) as T) : null;
  }

  async set(key: string, value: unknown, ttl: number) {
    this.store.set(key, { value: JSON.stringify(value), ttl });
  }

  async del(...keys: string[]) {
    keys.forEach((key) => this.store.delete(key));
  }

  async delByPattern(pattern: string) {
    const prefix = pattern.replace(/\*$/, "");
    [...this.store.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => this.store.delete(key));
  }
}

class TestService extends BaseService<BaseEntity> {
  constructor(
    cache: ICacheService,
    protected readonly listCache: { ttl: number; dependents?: readonly string[] } | undefined,
  ) {
    super();
    Object.assign(this, { cache });
  }

  protected readonly repo = { getEntityName: () => "SampleEntity" } as unknown as EntityRepository<BaseEntity>;

  list(params: object, loader: () => Promise<unknown>) {
    return this.cachedList("page", params, loader);
  }

  invalidate() {
    return this.invalidateLists();
  }
}

describe("BaseService list cache", () => {
  it("lần gọi sau với cùng tham số lấy từ cache, tham số khác thì query lại", async () => {
    const cache = new MemoryCache();
    const service = new TestService(cache, { ttl: LIST_CACHE_TTL.STATIC });
    let calls = 0;
    const loader = async () => ({ data: [{ id: String(++calls) }], total: 1 });

    expect(await service.list({ page: 1, limit: 10 }, loader)).toEqual({ data: [{ id: "1" }], total: 1 });
    expect(await service.list({ limit: 10, page: 1 }, loader)).toEqual({ data: [{ id: "1" }], total: 1 });
    expect(await service.list({ page: 2, limit: 10 }, loader)).toEqual({ data: [{ id: "2" }], total: 1 });
    expect(calls).toBe(2);
  });

  it("key chứa phiên bản build để bản deploy mới không đọc dữ liệu theo dạng response cũ", async () => {
    const cache = new MemoryCache();
    const service = new TestService(cache, { ttl: LIST_CACHE_TTL.STATIC });

    await service.list({ page: 1 }, async () => []);

    expect([...cache.store.keys()]).toEqual([`cache:sample:list:${LIST_CACHE_VERSION}:page:{"page":1}`]);
  });

  it("request có từ khóa tìm kiếm dùng TTL ngắn", async () => {
    const cache = new MemoryCache();
    const service = new TestService(cache, { ttl: LIST_CACHE_TTL.STATIC });

    await service.list({ page: 1 }, async () => []);
    await service.list({ page: 1, keyword: "abc" }, async () => []);

    expect([...cache.store.values()].map((entry) => entry.ttl)).toEqual([LIST_CACHE_TTL.STATIC, LIST_CACHE_TTL.SEARCH]);
  });

  it("xóa cache list của chính nó và các list phụ thuộc, giữ nguyên list khác", async () => {
    const cache = new MemoryCache();
    const service = new TestService(cache, { ttl: LIST_CACHE_TTL.STATIC, dependents: ["other"] });
    await service.list({ page: 1 }, async () => []);
    await cache.set("cache:other:list:page:{}", [], 60);
    await cache.set("cache:unrelated:list:page:{}", [], 60);

    await service.invalidate();

    expect([...cache.store.keys()]).toEqual(["cache:unrelated:list:page:{}"]);
  });

  it("service không bật listCache thì không cache và không xóa gì", async () => {
    const cache = new MemoryCache();
    const service = new TestService(cache, undefined);
    await cache.set("cache:sample:list:page:{}", [], 60);
    let calls = 0;

    await service.list({}, async () => ++calls);
    await service.list({}, async () => ++calls);
    await service.invalidate();

    expect(calls).toBe(2);
    expect(cache.store.size).toBe(1);
  });

  it("prefix trong LIST_CACHE khớp cachePrefix của entity", () => {
    const prefixOf = (entity: { name: string }) => entity.name.toLowerCase().replace("entity", "");
    expect(LIST_CACHE).toEqual({
      CATEGORY: prefixOf(CategoryEntity),
      FORM: prefixOf(FormEntity),
      REQUEST_TYPE: prefixOf(RequestTypeEntity),
      APPROVAL_WORKFLOW: prefixOf(ApprovalWorkflowEntity),
      DEPARTMENT: prefixOf(DepartmentEntity),
      USER: prefixOf(UserEntity),
      GROUP: prefixOf(GroupEntity),
      ROLE: prefixOf(RoleEntity),
      PRINCIPAL: prefixOf(PrincipalEntity),
      APP_SETTING: prefixOf(AppSettingEntity),
    });
  });
});
