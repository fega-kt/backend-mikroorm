import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ApprovalRequestService } from "../../services/approval-request/approval-request.service";
import {
  approvalRequestFilterValidation,
  cancelApprovalRequestValidation,
  createApprovalRequestValidation,
  updateApprovalRequestValidation,
} from "./approval-request.validation";

/** Đơn đề nghị — mọi người dùng đăng nhập; quyền theo người tạo/người duyệt kiểm tra trong service */
@Controller("approval-request")
export class ApprovalRequestController {
  constructor(private readonly requestService: ApprovalRequestService) {}

  @Get("request-types")
  requestTypes() {
    return this.requestService.getCreatableRequestTypes();
  }

  @Get("mine")
  mine(@Query(new ZodValidationPipe(approvalRequestFilterValidation)) query: z.infer<typeof approvalRequestFilterValidation>) {
    return this.requestService.getMyRequests(query);
  }

  @Get()
  @Permissions(PermissionType.MenuAllApprovalRequest)
  findAll(@Query(new ZodValidationPipe(approvalRequestFilterValidation)) query: z.infer<typeof approvalRequestFilterValidation>) {
    return this.requestService.getAllRequests(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createApprovalRequestValidation)) data: z.infer<typeof createApprovalRequestValidation>) {
    return this.requestService.createRequest(data);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.requestService.getRequestDetail(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApprovalRequestValidation)) data: z.infer<typeof updateApprovalRequestValidation>,
  ) {
    return this.requestService.updateRequest(id, data);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.requestService.deleteRequest(id);
  }

  @Post(":id/submit")
  submit(@Param("id") id: string) {
    return this.requestService.submitRequest(id);
  }

  @Post(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelApprovalRequestValidation)) data: z.infer<typeof cancelApprovalRequestValidation>,
  ) {
    return this.requestService.cancelRequest(id, data.comment);
  }
}
