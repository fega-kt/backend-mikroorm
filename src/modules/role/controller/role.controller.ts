import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import z from "zod";
import { RoleEntity } from "../entity/role.entity";
import { RoleService } from "../service/role.service";
import { createRoleValidation, updateRoleValidation } from "../validation/role.validation";

@Controller("role")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createRoleValidation))
    data: z.infer<typeof createRoleValidation>,
  ): Promise<RoleEntity> {
    return this.roleService.createRole(data);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateRole)
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateRoleValidation))
    data: z.infer<typeof updateRoleValidation>,
  ): Promise<RoleEntity> {
    return this.roleService.updateRole(id, data);
  }

  @Get()
  @Permissions(PermissionType.MenuRole)
  findAll(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.roleService.findAllRoles(Number(page), Number(limit));
  }

  @Get(":id")
  @Permissions(PermissionType.ViewRoleDetail)
  getDetail(@Param("id", new IdValidationPipe()) id: string): Promise<RoleEntity> {
    return this.roleService.getDetail(id);
  }
}
