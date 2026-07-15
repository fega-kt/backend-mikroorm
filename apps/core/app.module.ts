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
import { DatabaseModule } from "@modules/database/database.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { CacheModule } from "@modules/cache/cache.module";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { MailModule } from "@modules/mail/mail.module";
import { HealthModule } from "@modules/health/health.module";
import { CoreServiceModule } from "@core-service/core-service.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
    ThrottlerModule.forRoot([{ ttl: ENV.THROTTLE_TTL * 1000, limit: ENV.THROTTLE_LIMIT }]),
    MetricsModule,
    DatabaseModule,
    RabbitMQModule,
    CacheModule,
    CloudflareKvModule,
    SupabaseModule,
    MailModule,
    HealthModule,
    LoggerModule.forRoot("be-core"),
    CoreServiceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class CoreAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
