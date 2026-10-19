import { describeError } from "@common/utils/describe-error.util";
import { maskUrl } from "@common/utils/mask-url.util";
import { ENV } from "@config/env.config";
import { ICacheService } from "@modules/cache/cache.interface";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
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

    const maskedUrl = maskUrl(ENV.REDIS_URL);

    this.client.on("error", (err) => this.logger.error(`Redis error: ${describeError(err)}`, err?.stack));
    this.client.on("connect", () => this.logger.log(`Redis connected: ${maskedUrl}`));
    this.client.on("close", () => this.logger.warn("Redis connection closed"));
    this.client.on("reconnecting", () => this.logger.warn("Redis reconnecting..."));

    this.client.connect().catch((err) => this.logger.error(`Redis initial connect failed: ${describeError(err)}`, err?.stack));
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

  /**
   * Khóa phân tán đơn giản (SET NX PX). Trả về true nếu lấy được khóa, false nếu instance khác đang giữ,
   * null nếu Redis lỗi — caller tự quyết định có chạy tiếp không.
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean | null> {
    try {
      return (await this.client.set(key, String(Date.now()), "PX", ttlMs, "NX")) === "OK";
    } catch (err) {
      this.logger.warn(`Redis lock failed for key "${key}"`, err);
      return null;
    }
  }

  /**
   * Như acquireLock nhưng có chủ: trả về token để nhả đúng khóa của mình bằng releaseLock (false nếu đang bị giữ,
   * null nếu Redis lỗi). Dùng khi cần nhả sớm thay vì chờ hết hạn.
   */
  async acquireOwnedLock(key: string, ttlMs: number): Promise<string | false | null> {
    const token = randomUUID();
    try {
      return (await this.client.set(key, token, "PX", ttlMs, "NX")) === "OK" ? token : false;
    } catch (err) {
      this.logger.warn(`Redis lock failed for key "${key}"`, err);
      return null;
    }
  }

  /** Nhả khóa nếu vẫn là của mình (khóa đã hết hạn và bị nơi khác lấy thì không đụng tới) */
  async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        key,
        token,
      );
    } catch (err) {
      this.logger.warn(`Redis unlock failed for key "${key}" (expires by itself)`, err);
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
