import { ActivityLogQueueModule } from "@modules/activity-log-queue/activity-log-queue.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { Module } from "@nestjs/common";
import { InactiveReminderConsumer } from "./consumer/inactive-reminder.consumer";
import { InactiveUserReminderService } from "./service/inactive-user-reminder.service";

@Module({
  imports: [ActivityLogQueueModule, RabbitMQModule],
  providers: [InactiveUserReminderService, InactiveReminderConsumer],
  exports: [InactiveUserReminderService],
})
export class InactiveReminderModule {}
