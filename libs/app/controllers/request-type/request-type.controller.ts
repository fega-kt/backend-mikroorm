import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { RequestTypeService } from "../../services/request-type/request-type.service";
import { createRequestTypeValidation, requestTypeFilterValidation, updateRequestTypeValidation } from "./request-type.validation";

@Controller("request-type")
export class RequestTypeController {
  constructor(private readonly requestTypeService: RequestTypeService) {}

  @Post()
  @Permissions(PermissionType.CreateRequestType)
  create(@Body(new ZodValidationPipe(createRequestTypeValidation)) data: z.infer<typeof createRequestTypeValidation>) {
    return this.requestTypeService.createRequestType(data);
  }

  @Get()
  @Permissions(PermissionType.MenuRequestType)
  findAll(@Query(new ZodValidationPipe(requestTypeFilterValidation)) query: z.infer<typeof requestTypeFilterValidation>) {
    return this.requestTypeService.getRequestTypes(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewRequestTypeDetail)
  findOne(@Param("id") id: string) {
    return this.requestTypeService.getRequestTypeById(id);
  }

  @Get(":id/versions")
  @Permissions(PermissionType.ViewRequestTypeDetail)
  versions(@Param("id") id: string) {
    return this.requestTypeService.getVersions(id);
  }

  @Get(":id/versions/:versionId")
  @Permissions(PermissionType.ViewRequestTypeDetail)
  version(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.requestTypeService.getVersion(id, versionId);
  }

  @Post(":id/versions/:versionId/restore")
  @Permissions(PermissionType.UpdateRequestType)
  restore(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.requestTypeService.restoreVersion(id, versionId);
  }

  /** PUT: thay thế toàn bộ phần sửa được (mã không đổi); trường tùy chọn vắng mặt = rỗng */
  @Put(":id")
  @Permissions(PermissionType.UpdateRequestType)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRequestTypeValidation)) data: z.infer<typeof updateRequestTypeValidation>,
  ) {
    return this.requestTypeService.updateRequestType(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteRequestType)
  remove(@Param("id") id: string) {
    return this.requestTypeService.deleteRequestType(id);
  }
}
