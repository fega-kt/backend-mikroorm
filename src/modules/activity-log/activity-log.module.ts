import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { ActivityLogController } from "./controller/activity-log.controller";
import { ActivityLogEntity } from "./entity/activity-log.entity";
import { ActivityLogService } from "./service/activity-log.service";

@Module({
  imports: [MikroOrmModule.forFeature([ActivityLogEntity])],
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
