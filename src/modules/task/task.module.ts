import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { TaskController } from "./controller/task.controller";
import { TaskEntity } from "./entity/task.entity";
import { TaskService } from "./service/task.service";

@Module({
  imports: [MikroOrmModule.forFeature([TaskEntity])],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
