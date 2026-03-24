import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { ActivityLogEntity } from "./entity/activity-log.entity";
import { ActivityLogService } from "./service/activity-log.service";

@Module({
  imports: [MikroOrmModule.forFeature([ActivityLogEntity])],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
