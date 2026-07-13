import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [RabbitMQModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
