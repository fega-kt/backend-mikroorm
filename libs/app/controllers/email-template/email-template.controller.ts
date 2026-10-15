import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { EmailTemplateService } from "../../services/email-template/email-template.service";
import { createEmailTemplateValidation, previewEmailTemplateValidation, updateEmailTemplateValidation } from "./email-template.validation";

@Controller("email-template")
export class EmailTemplateController {
  constructor(private readonly templateService: EmailTemplateService) {}

  /** Danh sách để chọn ở bước Thông báo — cả người thiết kế quy trình dùng nên chỉ cần quyền vào quy trình */
  @Get()
  @Permissions(PermissionType.MenuEmailTemplate, PermissionType.MenuApprovalWorkflow)
  findAll() {
    return this.templateService.listTemplates();
  }

  @Get("variables")
  @Permissions(PermissionType.MenuEmailTemplate)
  variables() {
    return this.templateService.variables();
  }

  @Get("brand")
  @Permissions(PermissionType.MenuEmailTemplate)
  brand() {
    return this.templateService.brand();
  }

  @Get("starter")
  @Permissions(PermissionType.MenuEmailTemplate)
  starter() {
    return this.templateService.starter();
  }

  @Post("preview")
  @Permissions(PermissionType.MenuEmailTemplate)
  preview(@Body(new ZodValidationPipe(previewEmailTemplateValidation)) data: z.infer<typeof previewEmailTemplateValidation>) {
    const { code, ...template } = data;
    return this.templateService.preview(template, code);
  }

  @Get(":code")
  @Permissions(PermissionType.MenuEmailTemplate)
  findOne(@Param("code") code: string) {
    return this.templateService.getTemplate(code);
  }

  @Post()
  @Permissions(PermissionType.UpdateEmailTemplate)
  create(@Body(new ZodValidationPipe(createEmailTemplateValidation)) data: z.infer<typeof createEmailTemplateValidation>) {
    return this.templateService.createTemplate(data);
  }

  @Patch(":code")
  @Permissions(PermissionType.UpdateEmailTemplate)
  update(
    @Param("code") code: string,
    @Body(new ZodValidationPipe(updateEmailTemplateValidation)) data: z.infer<typeof updateEmailTemplateValidation>,
  ) {
    return this.templateService.updateTemplate(code, data);
  }

  /** Mẫu tùy chỉnh: xoá; mẫu hệ thống: khôi phục mặc định */
  @Delete(":code")
  @Permissions(PermissionType.UpdateEmailTemplate)
  remove(@Param("code") code: string) {
    return this.templateService.deleteTemplate(code);
  }
}
