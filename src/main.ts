import { HttpExceptionFilter } from "@common/filters/http-exception.filter";
import { ENV } from "@config/env.config";
import { MikroORM } from "@mikro-orm/core";
import { JwtAuthGuard } from "@modules/auth/guards/jwt-auth.guard";
import { Logger } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("START APP");

  const app = await NestFactory.create(AppModule);

  const orm = app.get(MikroORM);

  await orm.getSchemaGenerator().ensureIndexes();

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix(ENV.API_PREFIX);

  const post = ENV.PORT || 3000;
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));
  await app.listen(3000);
  logger.log(`Server is running on http://localhost:${post}`);
}
bootstrap();
