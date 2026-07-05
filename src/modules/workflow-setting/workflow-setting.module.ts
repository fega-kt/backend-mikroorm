import { MikroOrmModule } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { FlowableClientModule } from "@modules/flowable-client/flowable-client.module";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { Module } from "@nestjs/common";
import { ApprovalProcessController } from "./controller/approval-process.controller";
import { WorkflowCallbackController } from "./controller/workflow-callback.controller";
import { WorkflowSettingController } from "./controller/workflow-setting.controller";
import { WorkflowSettingEntity } from "./entity/workflow-setting.entity";
import { WorkflowRegistryService } from "./service/workflow-registry.service";
import { WorkflowSettingService } from "./service/workflow-setting.service";

@Module({
  imports: [MikroOrmModule.forFeature([WorkflowSettingEntity, CategoryEntity, PrincipalEntity]), FlowableClientModule],
  providers: [WorkflowSettingService, WorkflowRegistryService],
  controllers: [WorkflowSettingController, ApprovalProcessController, WorkflowCallbackController],
  exports: [WorkflowSettingService, WorkflowRegistryService, FlowableClientModule],
})
export class WorkflowSettingModule {}
