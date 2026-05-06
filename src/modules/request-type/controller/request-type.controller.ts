import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { RequestTypeService } from "../service/request-type.service";
import {
  createRequestTypeValidation,
  requestTypeFilterValidation,
  updateRequestTypeValidation,
} from "../validation/request-type.validation";

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

  @Patch(":id")
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
