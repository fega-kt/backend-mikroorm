export const CACHE_SERVICE = Symbol("CACHE_SERVICE");

export interface ICacheService {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Xóa tất cả key khớp pattern (Redis glob hoặc CF KV prefix trước dấu *) */
  delByPattern(pattern: string): Promise<void>;
}
