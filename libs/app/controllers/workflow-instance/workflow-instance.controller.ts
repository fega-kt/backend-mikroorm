import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WorkflowActionsService } from "../../services/workflow-actions/workflow-actions.service";
import { WorkflowInstanceService } from "../../services/workflow-instance/workflow-instance.service";
import { createWorkflowInstanceValidation, workflowInstanceFilterValidation } from "./workflow-instance.validation";

@Controller("workflow-instance")
export class WorkflowInstanceController {
  constructor(
    private readonly workflowInstanceService: WorkflowInstanceService,
    private readonly workflowActionsService: WorkflowActionsService,
  ) {}

  @Post()
  @Permissions(PermissionType.CreateWorkflowInstance)
  create(@Body(new ZodValidationPipe(createWorkflowInstanceValidation)) data: z.infer<typeof createWorkflowInstanceValidation>) {
    return this.workflowInstanceService.createWorkflowInstance(data);
  }

  @Get()
  @Permissions(PermissionType.MenuWorkflowInstance)
  findAll(@Query(new ZodValidationPipe(workflowInstanceFilterValidation)) query: z.infer<typeof workflowInstanceFilterValidation>) {
    return this.workflowInstanceService.getWorkflowInstances(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewWorkflowInstanceDetail)
  findOne(@Param("id") id: string) {
    return this.workflowInstanceService.getWorkflowInstanceById(id);
  }

  @Post(":id/start")
  @Permissions(PermissionType.UpdateWorkflowInstance)
  start(@Param("id") id: string) {
    return this.workflowActionsService.startWorkflow(id);
  }
}
