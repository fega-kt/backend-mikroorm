import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { NotificationController } from "./controller/notification.controller";
import { NotificationEntity } from "./entity/notification.entity";
import { NotificationService } from "./service/notification.service";

@Module({
  imports: [MikroOrmModule.forFeature([NotificationEntity])],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
