import { appEntities } from "@app-domain/entities";
import { ApprovalEngineService } from "@app-domain/services/approval-engine/approval-engine.service";
import { ApprovalEventsPublisher } from "@app-domain/services/approval-engine/approval-events";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { NotificationEntity } from "@core-service/entities/notification";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { Module } from "@nestjs/common";
import { ApprovalEmailConsumer } from "./approval-email.consumer";
import { ApprovalSlaCron } from "./approval-sla.cron";

@Module({
  imports: [
    RabbitMQModule,
    MikroOrmModule.forFeature([...appEntities, AttachmentEntity, DepartmentEntity, NotificationEntity, PrincipalEntity, UserEntity]),
  ],
  providers: [ApprovalEventsPublisher, ApprovalEngineService, ApprovalSlaCron, ApprovalEmailConsumer],
})
export class ApprovalJobModule {}
