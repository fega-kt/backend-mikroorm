import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ProjectModule } from "@modules/project/project.module";
import { TaskEntity } from "@modules/task/entity/task.entity";
import { Module } from "@nestjs/common";
import { TimeLogController } from "./controller/timelog.controller";
import { TimeLogEntity } from "./entity/timelog.entity";
import { TimeLogService } from "./service/timelog.service";

@Module({
  imports: [MikroOrmModule.forFeature([TimeLogEntity, TaskEntity]), ProjectModule],
  providers: [TimeLogService],
  controllers: [TimeLogController],
  exports: [TimeLogService],
})
export class TimeLogModule {}
