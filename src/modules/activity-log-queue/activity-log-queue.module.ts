import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { ActivityLogQueueController } from "./controller/activity-log-queue.controller";
import { ActivityLogQueueEntity } from "./entity/activity-log-queue.entity";
import { ActivityLogQueueService } from "./service/activity-log-queue.service";

@Module({
  imports: [MikroOrmModule.forFeature([ActivityLogQueueEntity])],
  providers: [ActivityLogQueueService],
  controllers: [ActivityLogQueueController],
  exports: [ActivityLogQueueService],
})
export class ActivityLogQueueModule {}
