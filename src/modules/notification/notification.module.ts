import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { NotificationController } from "./controller/notification.controller";
import { NotificationEntity } from "./entity/notification.entity";
import { InactiveUserReminderService } from "./service/inactive-user-reminder.service";
import { NotificationService } from "./service/notification.service";

@Module({
  imports: [MikroOrmModule.forFeature([NotificationEntity])],
  providers: [NotificationService, InactiveUserReminderService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
