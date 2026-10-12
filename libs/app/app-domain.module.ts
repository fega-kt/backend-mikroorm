import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { NotificationEntity } from "@core-service/entities/notification";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { OutboxModule } from "@modules/outbox/outbox.module";
import { appControllers } from "./controllers";
import { appServices } from "./services";
import { appEntities } from "./entities";

@Module({
  imports: [
    OutboxModule,
    MikroOrmModule.forFeature([...appEntities, AttachmentEntity, DepartmentEntity, NotificationEntity, PrincipalEntity, UserEntity]),
  ],
  controllers: [...appControllers],
  providers: [...appServices],
  exports: [...appServices],
})
export class AppDomainModule {}
