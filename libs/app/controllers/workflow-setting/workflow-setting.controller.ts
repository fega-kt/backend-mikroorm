import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WorkflowSettingService } from "../../services/workflow-setting/workflow-setting.service";
import {
  createWorkflowSettingValidation,
  updateWorkflowSettingValidation,
  workflowSettingFilterValidation,
} from "./workflow-setting.validation";

@Controller("workflow-setting")
export class WorkflowSettingController {
  constructor(private readonly workflowSettingService: WorkflowSettingService) {}

  @Post()
  @Permissions(PermissionType.CreateWorkflowSetting)
  create(@Body(new ZodValidationPipe(createWorkflowSettingValidation)) data: z.infer<typeof createWorkflowSettingValidation>) {
    return this.workflowSettingService.createWorkflowSetting(data);
  }

  @Get()
  @Permissions(PermissionType.MenuWorkflowSetting)
  findAll(@Query(new ZodValidationPipe(workflowSettingFilterValidation)) query: z.infer<typeof workflowSettingFilterValidation>) {
    return this.workflowSettingService.getWorkflowSettings(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewWorkflowSettingDetail)
  findOne(@Param("id") id: string) {
    return this.workflowSettingService.getWorkflowSettingById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateWorkflowSetting)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkflowSettingValidation)) data: z.infer<typeof updateWorkflowSettingValidation>,
  ) {
    return this.workflowSettingService.updateWorkflowSetting(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteWorkflowSetting)
  remove(@Param("id") id: string) {
    return this.workflowSettingService.deleteWorkflowSetting(id);
  }
}
