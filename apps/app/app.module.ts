import { LoggerMiddleware } from "@common/middleware/logger.middleware";
import mikroConfig from "@config/mikro-orm.config";
import { ENV } from "@config/env.config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { LoggerModule } from "@common/logger/logger.module";
import { MetricsModule } from "@modules/metrics/metrics.module";
import { CacheModule } from "@modules/cache/cache.module";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { HealthModule } from "@modules/health/health.module";
import { AuthGuardModule } from "@core-service/auth-guard.module";
import { AppDomainModule } from "@app-domain/app-domain.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
    ThrottlerModule.forRoot([{ ttl: ENV.THROTTLE_TTL * 1000, limit: ENV.THROTTLE_LIMIT }]),
    MetricsModule,
    CacheModule,
    CloudflareKvModule,
    HealthModule,
    LoggerModule.forRoot("be-app"),
    AuthGuardModule,
    AppDomainModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
