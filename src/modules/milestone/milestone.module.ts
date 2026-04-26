import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ProjectModule } from "@modules/project/project.module";
import { Module } from "@nestjs/common";
import { MilestoneController } from "./controller/milestone.controller";
import { MilestoneEntity } from "./entity/milestone.entity";
import { MilestoneService } from "./service/milestone.service";

@Module({
  imports: [MikroOrmModule.forFeature([MilestoneEntity]), ProjectModule],
  providers: [MilestoneService],
  controllers: [MilestoneController],
  exports: [MilestoneService],
})
export class MilestoneModule {}
