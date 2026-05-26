import { MikroOrmModule } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { Module } from "@nestjs/common";
import { WorkflowSettingController } from "./controller/workflow-setting.controller";
import { WorkflowSettingEntity } from "./entity/workflow-setting.entity";
import { WorkflowSettingService } from "./service/workflow-setting.service";

@Module({
  imports: [MikroOrmModule.forFeature([WorkflowSettingEntity, CategoryEntity, PrincipalEntity])],
  providers: [WorkflowSettingService],
  controllers: [WorkflowSettingController],
  exports: [WorkflowSettingService],
})
export class WorkflowSettingModule {}
