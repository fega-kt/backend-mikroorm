import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { DepartmentService } from "../service/department.service";
import { createDepartmentValidation, updateDepartmentValidation } from "../validation/department.validation";

@Controller("department")
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @Permissions(PermissionType.CreateDeparment)
  create(
    @Body(new ZodValidationPipe(createDepartmentValidation))
    data: z.infer<typeof createDepartmentValidation>,
  ): Promise<DepartmentEntity> {
    return this.departmentService.create(data);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateDeparment)
  update(
    @Param("id", IdValidationPipe) id: string,
    @Body(new ZodValidationPipe(updateDepartmentValidation))
    data: z.infer<typeof updateDepartmentValidation>,
  ): Promise<DepartmentEntity> {
    return this.departmentService.update(id, data);
  }

  @Get()
  @Permissions(PermissionType.MenuDeparment)
  getList(): Promise<DepartmentEntity[]> {
    return this.departmentService.getList();
  }

  @Get(":id")
  @Permissions(PermissionType.ViewDeparmentDetail)
  getDetail(@Param("id", IdValidationPipe) id: string): Promise<DepartmentEntity> {
    return this.departmentService.getDetail(id);
  }
}
