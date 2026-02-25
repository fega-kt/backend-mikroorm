import { LoggerModule } from "@common/logger/logger.module";
import { LoggerMiddleware } from "@common/middleware/logger.middleware";
import mikroConfig from "@config/mikro-orm.config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AuthModule } from "@modules/auth/auth.module";
import { HealthModule } from "@modules/health/health.module";
import { UsersModule } from "@modules/users/users.module";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    HealthModule,
    LoggerModule,
    AuthModule,
    UsersModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*"); // ✅ tất cả API
  }
}
