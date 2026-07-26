import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { WorkflowTaskService } from "../../services/workflow-task/workflow-task.service";
import { workflowTaskFilterValidation } from "./workflow-task.validation";

@Controller("workflow-task")
export class WorkflowTaskController {
  constructor(private readonly workflowTaskService: WorkflowTaskService) {}

  @Get("my-tasks")
  @Permissions(PermissionType.MenuWorkflowTask)
  myTasks(@Query(new ZodValidationPipe(workflowTaskFilterValidation)) query: z.infer<typeof workflowTaskFilterValidation>) {
    return this.workflowTaskService.getMyTasks(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewWorkflowTaskDetail)
  findOne(@Param("id") id: string) {
    return this.workflowTaskService.getWorkflowTaskById(id);
  }
}
