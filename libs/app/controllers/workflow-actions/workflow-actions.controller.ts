import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { WorkflowActionsService } from "../../services/workflow-actions/workflow-actions.service";
import {
  cancelWorkflowValidation,
  requestReviewValidation,
  requestToCancelValidation,
  workflowActionValidation,
} from "./workflow-actions.validation";

@Controller("workflow-actions")
export class WorkflowActionsController {
  constructor(private readonly workflowActionsService: WorkflowActionsService) {}

  @Post("approve")
  @Permissions(PermissionType.ApproveWorkflowTask)
  approve(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.approveTask(body.workflowTaskId, body.comment);
  }

  @Post("reject")
  @Permissions(PermissionType.RejectWorkflowTask)
  reject(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.rejectTask(body.workflowTaskId, body.comment);
  }

  @Post("return")
  @Permissions(PermissionType.ReturnWorkflowTask)
  returnTask(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.returnTask(body.workflowTaskId, body.comment);
  }

  @Post("cancel")
  @Permissions(PermissionType.CancelWorkflowInstance)
  cancel(@Body(new ZodValidationPipe(cancelWorkflowValidation)) body: z.infer<typeof cancelWorkflowValidation>) {
    return this.workflowActionsService.cancelWorkflow(body.workflowInstanceId, body.comment);
  }

  @Post("request-to-change")
  @Permissions(PermissionType.RequestChangeWorkflowTask)
  requestToChange(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.requestToChange(body.workflowTaskId, body.comment);
  }

  @Post("apply-change")
  @Permissions(PermissionType.ApplyChangeWorkflowTask)
  applyChange(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.applyChange(body.workflowTaskId);
  }

  @Post("request-review")
  @Permissions(PermissionType.RequestReviewWorkflowTask)
  requestReview(@Body(new ZodValidationPipe(requestReviewValidation)) body: z.infer<typeof requestReviewValidation>) {
    return this.workflowActionsService.requestReview(body.workflowTaskId, body.reviewerPrincipalIds, body.comment);
  }

  @Post("submit-review")
  @Permissions(PermissionType.SubmitReviewWorkflowTask)
  submitReview(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.submitReview(body.workflowTaskId, body.comment);
  }

  @Post("request-to-cancel")
  @Permissions(PermissionType.RequestToCancelWorkflowInstance)
  requestToCancel(@Body(new ZodValidationPipe(requestToCancelValidation)) body: z.infer<typeof requestToCancelValidation>) {
    return this.workflowActionsService.requestToCancel(body.workflowInstanceId, body.approverPrincipalIds, body.comment);
  }

  @Post("approve-cancellation")
  @Permissions(PermissionType.ApproveCancellationWorkflowInstance)
  approveCancellation(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.approveCancellation(body.workflowTaskId, body.comment);
  }

  @Post("reject-cancellation")
  @Permissions(PermissionType.RejectCancellationWorkflowInstance)
  rejectCancellation(@Body(new ZodValidationPipe(workflowActionValidation)) body: z.infer<typeof workflowActionValidation>) {
    return this.workflowActionsService.rejectCancellation(body.workflowTaskId, body.comment);
  }
}
