import { MikroOrmModule } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Module } from "@nestjs/common";
import { WorkflowSettingController } from "./controller/workflow-setting.controller";
import { WorkflowSettingEntity } from "./entity/workflow-setting.entity";
import { WorkflowSettingService } from "./service/workflow-setting.service";

@Module({
  imports: [MikroOrmModule.forFeature([WorkflowSettingEntity, CategoryEntity])],
  providers: [WorkflowSettingService],
  controllers: [WorkflowSettingController],
  exports: [WorkflowSettingService],
})
export class WorkflowSettingModule {}
