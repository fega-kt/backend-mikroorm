import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ApprovalDelegationService } from "../../services/approval-delegation/approval-delegation.service";
import {
  approvalDelegationFilterValidation,
  createApprovalDelegationValidation,
  updateApprovalDelegationValidation,
} from "./approval-delegation.validation";

/** Ủy quyền duyệt của chính người dùng */
@Controller("approval-delegation")
export class ApprovalDelegationController {
  constructor(private readonly delegationService: ApprovalDelegationService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(approvalDelegationFilterValidation)) query: z.infer<typeof approvalDelegationFilterValidation>) {
    return this.delegationService.getDelegations(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createApprovalDelegationValidation)) data: z.infer<typeof createApprovalDelegationValidation>) {
    return this.delegationService.createDelegation(data);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.delegationService.getDelegation(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApprovalDelegationValidation)) data: z.infer<typeof updateApprovalDelegationValidation>,
  ) {
    return this.delegationService.updateDelegation(id, data);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.delegationService.deleteDelegation(id);
  }
}
