import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { FormService } from "../../services/form/form.service";
import { createFormValidation, formFilterValidation, updateFormValidation } from "./form.validation";

@Controller("form")
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post()
  @Permissions(PermissionType.CreateForm)
  create(@Body(new ZodValidationPipe(createFormValidation)) data: z.infer<typeof createFormValidation>) {
    return this.formService.createForm(data);
  }

  @Get()
  @Permissions(PermissionType.MenuForm)
  findAll(@Query(new ZodValidationPipe(formFilterValidation)) query: z.infer<typeof formFilterValidation>) {
    return this.formService.getForms(query);
  }

  /** Danh sách rút gọn cho ô chọn form ở màn loại tờ trình */
  @Get("options")
  @Permissions(PermissionType.MenuForm, PermissionType.CreateRequestType, PermissionType.UpdateRequestType)
  options() {
    return this.formService.getFormOptions();
  }

  @Get(":id")
  @Permissions(PermissionType.ViewFormDetail)
  findOne(@Param("id") id: string) {
    return this.formService.getFormById(id);
  }

  @Get(":id/versions")
  @Permissions(PermissionType.ViewFormDetail)
  versions(@Param("id") id: string) {
    return this.formService.getVersions(id);
  }

  @Get(":id/versions/:versionId")
  @Permissions(PermissionType.ViewFormDetail)
  version(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.formService.getVersion(id, versionId);
  }

  /** PUT: thay thế toàn bộ phần sửa được (mã không đổi); trường tùy chọn vắng mặt = rỗng */
  @Put(":id")
  @Permissions(PermissionType.UpdateForm)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateFormValidation)) data: z.infer<typeof updateFormValidation>) {
    return this.formService.updateForm(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteForm)
  remove(@Param("id") id: string) {
    return this.formService.deleteForm(id);
  }
}
