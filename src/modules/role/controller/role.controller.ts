import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Post } from "@nestjs/common";
import z from "zod";
import { RoleEntity } from "../entity/role.entity";
import { RoleService } from "../service/role.service";
import { createRoleValidation } from "../validation/role.validation";

@Controller("role")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createRoleValidation))
    data: z.infer<typeof createRoleValidation>
  ): Promise<RoleEntity> {
    return this.roleService.createRole(data);
  }
}
