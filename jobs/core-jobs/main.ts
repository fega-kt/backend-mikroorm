import { MetricsService } from "@modules/metrics/metrics.service";
import { ENV } from "@config/env.config";
import { NestFactory } from "@nestjs/core";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { CoreJobAppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(CoreJobAppModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get("/", (_req, res) => res.status(200).json({ timestamp: new Date() }));
  httpAdapter.head("/", (_req, res) => res.status(200).send());

  const metricsService = app.get(MetricsService);
  httpAdapter.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metricsService.registry.contentType);
    res.send(await metricsService.registry.metrics());
  });

  if (!ENV.CORE_JOB_PORT) throw new Error("CORE_JOB_PORT is required");
  const port = ENV.CORE_JOB_PORT;
  await app.listen(port);

  app.get(WINSTON_MODULE_NEST_PROVIDER).log(`
    ========================================
    🚀 be-core-job : ${ENV.NODE_ENV}
    🌐 PORT        : ${port}
    ========================================
    `);
}
void bootstrap();
