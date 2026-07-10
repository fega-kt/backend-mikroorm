import { HttpExceptionFilter } from "@common/filters/http-exception.filter";
import { ResponseInterceptor } from "@common/interceptors/response.interceptor";
import { ENV, NodeEnv } from "@config/env.config";
import handleApplySwagger from "@config/swagger.config";
import { MikroORM } from "@mikro-orm/core";
import { PermissionsGuard } from "@modules/auth/guards/permissions.guard";
import { Logger } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("START APP");

  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: ENV.CORS_ORIGINS ? ENV.CORS_ORIGINS.split(",") : [],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  const orm = app.get(MikroORM);

  await orm.schema.updateSchema({ safe: true });

  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get("/", (_req, res) => res.status(200).json({ timestamp: new Date() }));
  httpAdapter.head("/", (_req, res) => res.status(200).send());

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix(ENV.API_PREFIX);

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new PermissionsGuard(reflector));

  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = ENV.PORT || 3000;

  if (ENV.NODE_ENV === NodeEnv.DEVELOPMENT) {
    await handleApplySwagger(app, port);
  }

  await app.listen(port);

  logger.log(`
    ========================================
    🚀 MODE       : ${ENV.NODE_ENV}
    🌐 PORT       : ${ENV.PORT}
    🔗 URL        : http://localhost:${ENV.PORT}
    📦 DATABASE   : ${ENV.DB_NAME}
    🔗 API PREFIX : /${ENV.API_PREFIX}
    🗄️  CACHE      : ${ENV.CACHE_DRIVER}
    ========================================
    `);
}
void bootstrap();
