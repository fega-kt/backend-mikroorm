import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ApprovalAction } from "../../services/approval-engine/approval-engine.service";
import { type ApprovalRateStats, type ApprovedStats, ApprovalTaskService } from "../../services/approval-task/approval-task.service";
import { ApprovalSigningService } from "../../services/e-signature/approval-signing.service";
import {
  actionValidation,
  bulkApproveValidation,
  inboxFilterValidation,
  reassignValidation,
  signApproveValidation,
} from "./approval-task.validation";

/** Duyệt đơn — người thao tác phải là người duyệt của bước hiện tại (engine kiểm tra) */
@Controller("approval-task")
export class ApprovalTaskController {
  constructor(
    private readonly taskService: ApprovalTaskService,
    private readonly signingService: ApprovalSigningService,
  ) {}

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

  /** Mở hộp "Ký và duyệt": chuyển văn bản sang PDF nếu cần, trả vị trí ký gợi ý + khung chữ ký đã có */
  @Get(":requestId/signing")
  prepareSigning(@Param("requestId") requestId: string) {
    return this.signingService.prepare(requestId);
  }

  /** Ký số văn bản tờ trình rồi duyệt (bước bắt buộc ký) */
  @Post(":requestId/sign-approve")
  signAndApprove(
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(signApproveValidation)) data: z.infer<typeof signApproveValidation>,
  ) {
    return this.signingService.signAndApprove(requestId, data);
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
