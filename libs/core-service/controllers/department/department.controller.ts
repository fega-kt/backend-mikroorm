import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { WithChildren } from "@common/utils/tree.util";
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity, DepartmentStatus } from "../../entities/department";
import { DepartmentService } from "../../services/department/department.service";
import {
  createDepartmentValidation,
  DepartmentListFilterDto,
  departmentListFilterValidation,
  DepartmentUsersFilterDto,
  departmentUsersFilterValidation,
  updateDepartmentValidation,
} from "./department.validation";

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

  @Put(":id")
  @Permissions(PermissionType.UpdateDeparment)
  update(
    @Param("id", IdValidationPipe) id: string,
    @Body(new ZodValidationPipe(updateDepartmentValidation))
    data: z.infer<typeof updateDepartmentValidation>,
  ): Promise<DepartmentEntity> {
    return this.departmentService.update(id, data);
  }

  @Get()
  getList(@Query(new ZodValidationPipe(departmentListFilterValidation)) query: DepartmentListFilterDto) {
    return this.departmentService.getList(query);
  }

  @Get("department-tree")
  @Permissions(PermissionType.MenuDeparment)
  getTree(@Query(new ZodValidationPipe(departmentListFilterValidation)) { keyword, name, code, status }: DepartmentListFilterDto): Promise<
    WithChildren<
      {
        id: string;
        name: string;
        code: string;
        parentCode: string;
        status: DepartmentStatus;
        createdAt: Date;
        parent: string;
      },
      "children"
    >[]
  > {
    return this.departmentService.getTree({ keyword, name, code, status });
  }

  @Get(":id")
  @Permissions(PermissionType.ViewDeparmentDetail)
  getDetail(@Param("id", IdValidationPipe) id: string) {
    return this.departmentService.getDetail(id);
  }

  @Get(":id/users")
  @Permissions(PermissionType.ViewDeparmentDetail)
  getUsers(
    @Param("id", IdValidationPipe) id: string,
    @Query(new ZodValidationPipe(departmentUsersFilterValidation)) query: DepartmentUsersFilterDto,
  ) {
    return this.departmentService.getUsers(id, query);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteDeparment)
  remove(@Param("id", IdValidationPipe) id: string) {
    return this.departmentService.remove(id);
  }
}
