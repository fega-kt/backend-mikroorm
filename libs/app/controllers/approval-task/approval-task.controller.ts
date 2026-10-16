import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ApprovalAction } from "../../services/approval-engine/approval-engine.service";
import { type ApprovalRateStats, type ApprovedStats, ApprovalTaskService } from "../../services/approval-task/approval-task.service";
import { actionValidation, bulkApproveValidation, inboxFilterValidation, reassignValidation } from "./approval-task.validation";

/** Duyệt đơn — người thao tác phải là người duyệt của bước hiện tại (engine kiểm tra) */
@Controller("approval-task")
export class ApprovalTaskController {
  constructor(private readonly taskService: ApprovalTaskService) {}

  @Get("inbox")
  inbox(@Query(new ZodValidationPipe(inboxFilterValidation)) query: z.infer<typeof inboxFilterValidation>) {
    return this.taskService.getInbox(query);
  }

  @Get("inbox/count")
  count() {
    return this.taskService.countPending();
  }

  /** Thẻ "Tôi đã duyệt tháng này" ở trang chủ */
  @Get("stats/approved")
  approvedStats(): Promise<ApprovedStats> {
    return this.taskService.getApprovedStats();
  }

  /** Thẻ "Tỷ lệ duyệt" ở trang chủ */
  @Get("stats/approval-rate")
  approvalRateStats(): Promise<ApprovalRateStats> {
    return this.taskService.getApprovalRateStats();
  }

  @Post("bulk-approve")
  bulkApprove(@Body(new ZodValidationPipe(bulkApproveValidation)) data: z.infer<typeof bulkApproveValidation>) {
    return this.taskService.bulkApprove(data.requestIds, data.comment);
  }

  @Post("tasks/:taskId/reassign")
  @Permissions(PermissionType.ReassignApprovalTask)
  reassign(@Param("taskId") taskId: string, @Body(new ZodValidationPipe(reassignValidation)) data: z.infer<typeof reassignValidation>) {
    return this.taskService.reassign(taskId, data.userId, data.comment);
  }

  @Post(":requestId/approve")
  approve(@Param("requestId") requestId: string, @Body(new ZodValidationPipe(actionValidation)) data: z.infer<typeof actionValidation>) {
    return this.taskService.act(requestId, ApprovalAction.Approve, data.comment);
  }

  @Post(":requestId/reject")
  reject(@Param("requestId") requestId: string, @Body(new ZodValidationPipe(actionValidation)) data: z.infer<typeof actionValidation>) {
    return this.taskService.act(requestId, ApprovalAction.Reject, data.comment);
  }

  @Post(":requestId/return")
  returnRequest(
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(actionValidation)) data: z.infer<typeof actionValidation>,
  ) {
    return this.taskService.act(requestId, ApprovalAction.Return, data.comment);
  }
}
