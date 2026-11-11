import { Module } from "@nestjs/common";
import { CoreServiceJobModule } from "@core-service/core-service-job.module";
import { AccountLockedConsumer } from "./consumer/account-locked.consumer";
import { InactiveReminderConsumer } from "./consumer/inactive-reminder.consumer";
import { InactiveUserLockService } from "./service/inactive-user-lock.service";
import { InactiveUserReminderService } from "./service/inactive-user-reminder.service";
import { LastActiveBackfillService } from "./service/last-active-backfill.service";

@Module({
  imports: [CoreServiceJobModule],
  providers: [
    InactiveUserReminderService,
    InactiveUserLockService,
    LastActiveBackfillService,
    InactiveReminderConsumer,
    AccountLockedConsumer,
  ],
  exports: [InactiveUserReminderService, InactiveUserLockService],
})
export class InactiveReminderModule {}
