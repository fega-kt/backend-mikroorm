import { HttpExceptionFilter } from "@common/filters/http-exception.filter";
import { MetricsInterceptor } from "@common/interceptors/metrics.interceptor";
import { ResponseInterceptor } from "@common/interceptors/response.interceptor";
import { MetricsService } from "@modules/metrics/metrics.service";
import { ENV, NodeEnv } from "@config/env.config";
import handleApplySwagger from "@config/swagger.config";
import { PermissionsGuard } from "@core-service/guards/permissions.guard";
import { NestFactory, Reflector } from "@nestjs/core";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { AppAppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppAppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.enableCors({
    origin: ENV.CORS_ORIGINS ? ENV.CORS_ORIGINS.split(",") : [],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get("/", (_req, res) => res.status(200).json({ timestamp: new Date() }));
  httpAdapter.head("/", (_req, res) => res.status(200).send());

  const metricsService = app.get(MetricsService);
  httpAdapter.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metricsService.registry.contentType);
    res.send(await metricsService.registry.metrics());
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix(ENV.API_PREFIX);

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new PermissionsGuard(reflector));
  app.useGlobalInterceptors(new MetricsInterceptor(metricsService), new ResponseInterceptor());

  if (!ENV.APP_PORT) throw new Error("APP_PORT is required");
  const port = ENV.APP_PORT;

  if (ENV.NODE_ENV === NodeEnv.DEVELOPMENT) {
    await handleApplySwagger(app, port);
  }

  await app.listen(port);

  app.get(WINSTON_MODULE_NEST_PROVIDER).log(`
    ========================================
    🚀 MODE       : ${ENV.NODE_ENV}
    🌐 PORT       : ${port}  (APP_PORT)
    🔗 URL        : http://localhost:${port}
    🔗 API PREFIX : /${ENV.API_PREFIX}
    🗄️  CACHE      : ${ENV.CACHE_DRIVER}
    ========================================
    `);
}
void bootstrap();
