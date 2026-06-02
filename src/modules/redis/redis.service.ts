import { ENV } from "@config/env.config";
import { ICacheService } from "@modules/cache/cache.interface";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements ICacheService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis(ENV.REDIS_URL, { lazyConnect: true });
    this.client.on("error", (err) => this.logger.error("Redis error", err));
    this.client.connect().catch((err) => this.logger.error("Redis connect failed", err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  /** Dùng SCAN thay vì KEYS để an toàn với production */
  async delByPattern(pattern: string): Promise<void> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length) await this.client.del(...keys);
  }
}
