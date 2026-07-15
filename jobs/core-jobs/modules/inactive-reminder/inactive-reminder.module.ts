import { Module } from "@nestjs/common";
import { CoreServiceJobModule } from "@core-service/core-service-job.module";
import { InactiveReminderConsumer } from "./consumer/inactive-reminder.consumer";
import { InactiveUserReminderService } from "./service/inactive-user-reminder.service";

@Module({
  imports: [CoreServiceJobModule],
  providers: [InactiveUserReminderService, InactiveReminderConsumer],
  exports: [InactiveUserReminderService],
})
export class InactiveReminderModule {}
