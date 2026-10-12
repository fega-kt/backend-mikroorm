import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { ApprovalWorkflowService } from "../../services/approval-workflow/approval-workflow.service";
import {
  approvalWorkflowFilterValidation,
  createApprovalWorkflowValidation,
  saveDraftValidation,
  simulateValidation,
  updateApprovalWorkflowValidation,
  validateDefinitionValidation,
} from "./approval-workflow.validation";

@Controller("approval-workflow")
export class ApprovalWorkflowController {
  constructor(private readonly workflowService: ApprovalWorkflowService) {}

  @Get()
  @Permissions(PermissionType.MenuApprovalWorkflow)
  findAll(@Query(new ZodValidationPipe(approvalWorkflowFilterValidation)) query: z.infer<typeof approvalWorkflowFilterValidation>) {
    return this.workflowService.getWorkflows(query);
  }

  @Post()
  @Permissions(PermissionType.CreateApprovalWorkflow)
  create(@Body(new ZodValidationPipe(createApprovalWorkflowValidation)) data: z.infer<typeof createApprovalWorkflowValidation>) {
    return this.workflowService.createWorkflow(data);
  }

  @Get(":id")
  @Permissions(PermissionType.MenuApprovalWorkflow)
  findOne(@Param("id") id: string) {
    return this.workflowService.getWorkflowDetail(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateApprovalWorkflow)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApprovalWorkflowValidation)) data: z.infer<typeof updateApprovalWorkflowValidation>,
  ) {
    return this.workflowService.updateWorkflow(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteApprovalWorkflow)
  remove(@Param("id") id: string) {
    return this.workflowService.deleteWorkflow(id);
  }

  @Get(":id/versions")
  @Permissions(PermissionType.MenuApprovalWorkflow)
  versions(@Param("id") id: string) {
    return this.workflowService.getVersions(id);
  }

  @Get(":id/versions/:versionId")
  @Permissions(PermissionType.MenuApprovalWorkflow)
  version(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.workflowService.getVersion(id, versionId);
  }

  @Post(":id/versions/:versionId/restore")
  @Permissions(PermissionType.UpdateApprovalWorkflow)
  restore(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.workflowService.restoreVersion(id, versionId);
  }

  @Put(":id/draft")
  @Permissions(PermissionType.UpdateApprovalWorkflow)
  saveDraft(@Param("id") id: string, @Body(new ZodValidationPipe(saveDraftValidation)) data: z.infer<typeof saveDraftValidation>) {
    return this.workflowService.saveDraft(id, data.definition);
  }

  @Post(":id/validate")
  @Permissions(PermissionType.MenuApprovalWorkflow)
  validate(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(validateDefinitionValidation)) data: z.infer<typeof validateDefinitionValidation>,
  ) {
    return this.workflowService.validateWorkflow(id, data.definition);
  }

  @Post(":id/simulate")
  @Permissions(PermissionType.MenuApprovalWorkflow)
  simulate(@Param("id") id: string, @Body(new ZodValidationPipe(simulateValidation)) data: z.infer<typeof simulateValidation>) {
    return this.workflowService.simulateWorkflow(id, data);
  }

  @Post(":id/publish")
  @Permissions(PermissionType.PublishApprovalWorkflow)
  publish(@Param("id") id: string) {
    return this.workflowService.publishWorkflow(id);
  }
}
