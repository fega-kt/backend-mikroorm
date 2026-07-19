import { ENV } from "@config/env.config";
import { ICacheService } from "@modules/cache/cache.interface";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

const MAX_RETRY_DELAY_MS = 30_000;

@Injectable()
export class RedisService implements ICacheService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis(ENV.REDIS_URL, {
      lazyConnect: true,
      keepAlive: 1000,
      connectTimeout: 5000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        const delay = Math.min(100 * 2 ** times, MAX_RETRY_DELAY_MS);
        this.logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
    });

    const maskedUrl = ENV.REDIS_URL.replace(/:\/\/[^@]+@/, "://***@");

    this.client.on("error", (err) => this.logger.error("Redis error", err));
    this.client.on("connect", () => this.logger.log(`Redis connected: ${maskedUrl}`));
    this.client.on("close", () => this.logger.warn("Redis connection closed"));
    this.client.on("reconnecting", () => this.logger.warn("Redis reconnecting..."));

    this.client.connect().catch((err) => this.logger.error("Redis initial connect failed", err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis get failed for key "${key}"`, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`Redis set failed for key "${key}"`, err);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis del failed for keys [${keys.join(", ")}]`, err);
    }
  }

  /** Dùng SCAN thay vì KEYS để an toàn với production */
  async delByPattern(pattern: string): Promise<void> {
    try {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");

      if (keys.length) await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis delByPattern failed for pattern "${pattern}"`, err);
    }
  }
}
