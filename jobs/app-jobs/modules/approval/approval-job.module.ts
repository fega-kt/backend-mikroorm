import { appEntities } from "@app-domain/entities";
import { ApprovalEngineService } from "@app-domain/services/approval-engine/approval-engine.service";
import { ActivityLogQueueEntity } from "@core-service/entities/activity-log-queue";
import { AppSettingEntity } from "@core-service/entities/app-setting";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { NotificationEntity } from "@core-service/entities/notification";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { OutboxModule } from "@modules/outbox/outbox.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { Module } from "@nestjs/common";
import { ApprovalEmailConsumer } from "./approval-email.consumer";
import { ApprovalSlaCron } from "./approval-sla.cron";
import { OutboxRelayCron } from "./outbox-relay.cron";

@Module({
  imports: [
    RabbitMQModule,
    OutboxModule,
    MikroOrmModule.forFeature([
      ...appEntities,
      ActivityLogQueueEntity,
      AppSettingEntity,
      AttachmentEntity,
      DepartmentEntity,
      NotificationEntity,
      PrincipalEntity,
      UserEntity,
    ]),
  ],
  providers: [ApprovalEngineService, ApprovalSlaCron, ApprovalEmailConsumer, ActivityLogQueueService, OutboxRelayCron],
})
export class ApprovalJobModule {}
