import { Public } from "@common/decorators/public.decorator";
import { InternalAuthGuard } from "@common/guards/internal-auth.guard";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { WorkflowActionsService } from "../../services/workflow-actions/workflow-actions.service";
import { workflowFinalizeValidation, workflowTaskCreatedValidation } from "./workflow-callback.validation";

/** Called by the `flowable` project's `workflowFinalizeDelegate` JavaDelegate when a generated
 *  BPMN process reaches its end — the authoritative signal that a workflow instance is done. */
@Controller("internal/workflow")
@Public()
@UseGuards(InternalAuthGuard)
export class WorkflowCallbackController {
  constructor(private readonly workflowActionsService: WorkflowActionsService) {}

  @Post("finalize")
  finalize(@Body(new ZodValidationPipe(workflowFinalizeValidation)) body: z.infer<typeof workflowFinalizeValidation>) {
    return this.workflowActionsService.finalizeByBusinessKey(body.businessKey, body.decision);
  }

  @Post("task-created")
  taskCreated(@Body(new ZodValidationPipe(workflowTaskCreatedValidation)) body: z.infer<typeof workflowTaskCreatedValidation>) {
    return this.workflowActionsService.handleTaskCreated(body.processInstanceId, body.taskId, body.taskDefinitionKey, body.assignee);
  }
}
