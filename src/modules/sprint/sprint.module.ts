import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ProjectModule } from "@modules/project/project.module";
import { Module } from "@nestjs/common";
import { SprintController } from "./controller/sprint.controller";
import { SprintEntity } from "./entity/sprint.entity";
import { SprintService } from "./service/sprint.service";

@Module({
  imports: [MikroOrmModule.forFeature([SprintEntity]), ProjectModule],
  providers: [SprintService],
  controllers: [SprintController],
  exports: [SprintService],
})
export class SprintModule {}
