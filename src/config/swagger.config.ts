import { ENV } from "@config/env.config";
import { INestApplication, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

const config = new DocumentBuilder()
  .setTitle("Backend mikro-orm")
  .setDescription("API documentation")
  .setVersion("1.0")
  .addBearerAuth() // nếu bạn dùng JWT
  .build();

async function handleApplySwagger(app: INestApplication, port: number) {
  const logger = new Logger("SWAGGER API");

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${ENV.API_PREFIX}/docs`, app, document);

  logger.log(`📚 Swagger docs available at: http://localhost:${port}/${ENV.API_PREFIX}/docs`);
}

export default handleApplySwagger;
