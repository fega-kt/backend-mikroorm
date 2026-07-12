import { LoggerMiddleware } from "@common/middleware/logger.middleware";
import mikroConfig from "@config/mikro-orm.config";
import { ENV } from "@config/env.config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { modules } from "./app.imports";

@Module({
  imports: [
    ...modules,
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
    ThrottlerModule.forRoot([
      {
        ttl: ENV.THROTTLE_TTL * 1000,
        limit: ENV.THROTTLE_LIMIT,
      },
    ]),
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
