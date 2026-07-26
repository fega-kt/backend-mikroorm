import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WorkflowDelegationSettingService } from "../../services/workflow-delegation-setting/workflow-delegation-setting.service";
import {
  createWorkflowDelegationSettingValidation,
  updateWorkflowDelegationSettingValidation,
  workflowDelegationSettingFilterValidation,
} from "./workflow-delegation-setting.validation";

@Controller("workflow-delegation-setting")
export class WorkflowDelegationSettingController {
  constructor(private readonly workflowDelegationSettingService: WorkflowDelegationSettingService) {}

  @Post()
  @Permissions(PermissionType.CreateWorkflowDelegationSetting)
  create(
    @Body(new ZodValidationPipe(createWorkflowDelegationSettingValidation))
    data: z.infer<typeof createWorkflowDelegationSettingValidation>,
  ) {
    return this.workflowDelegationSettingService.createWorkflowDelegationSetting(data);
  }

  @Get()
  @Permissions(PermissionType.MenuWorkflowDelegationSetting)
  findAll(
    @Query(new ZodValidationPipe(workflowDelegationSettingFilterValidation))
    query: z.infer<typeof workflowDelegationSettingFilterValidation>,
  ) {
    return this.workflowDelegationSettingService.getWorkflowDelegationSettings(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewWorkflowDelegationSettingDetail)
  findOne(@Param("id") id: string) {
    return this.workflowDelegationSettingService.getWorkflowDelegationSettingById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateWorkflowDelegationSetting)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkflowDelegationSettingValidation))
    data: z.infer<typeof updateWorkflowDelegationSettingValidation>,
  ) {
    return this.workflowDelegationSettingService.updateWorkflowDelegationSetting(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteWorkflowDelegationSetting)
  remove(@Param("id") id: string) {
    return this.workflowDelegationSettingService.deleteWorkflowDelegationSetting(id);
  }
}
