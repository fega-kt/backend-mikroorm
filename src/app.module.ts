import { LoggerMiddleware } from "@common/middleware/logger.middleware";
import mikroConfig from "@config/mikro-orm.config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { modules } from "./app.imports";

@Module({
  imports: [
    ...modules,
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*"); // ✅ tất cả API
  }
}
