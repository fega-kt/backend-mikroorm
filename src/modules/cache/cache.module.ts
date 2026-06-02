import { ENV } from "@config/env.config";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { CloudflareKvService } from "@modules/cloudflare-kv/cloudflare-kv.service";
import { RedisModule } from "@modules/redis/redis.module";
import { RedisService } from "@modules/redis/redis.service";
import { Global, Logger, Module } from "@nestjs/common";
import { CACHE_SERVICE, ICacheService } from "./cache.interface";

@Global()
@Module({
  imports: [RedisModule, CloudflareKvModule],
  providers: [
    {
      provide: CACHE_SERVICE,
      useFactory: (redis: RedisService, cfKv: CloudflareKvService): ICacheService => {
        const driver = ENV.CACHE_DRIVER ?? "redis";
        new Logger("CacheModule").log(`Cache driver: ${driver}`);
        return driver === "cloudflare" ? cfKv : redis;
      },
      inject: [RedisService, CloudflareKvService],
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
