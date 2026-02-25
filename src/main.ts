import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const orm = app.get(MikroORM);

  await orm.getSchemaGenerator().ensureIndexes();
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(3000);
}
bootstrap();
