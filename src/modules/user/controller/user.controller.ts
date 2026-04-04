import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe, ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { UserService } from "../service/user.service";
import { createUserValidation, updateUserValidation } from "../validation/user.validation";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("current-user")
  currentUser(@CurrentUser() user: IUserResponse) {
    return user;
  }

  @Post()
  @Permissions(PermissionType.CreateUser)
  create(
    @Body(new ZodValidationPipe(createUserValidation))
    data: z.infer<typeof createUserValidation>
  ): Promise<void> {
    return this.userService.create(data);
  }

  @Get()
  @Permissions(PermissionType.MenuUser)
  findAll(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.userService.findAllUser(Number(page), Number(limit));
  }

  @Get(":id")
  @Permissions(PermissionType.ViewUserDetail)
  getDetail(@Param("id", new IdValidationPipe()) id: string) {
    return this.userService.getDetail(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateUser)
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateUserValidation))
    data: z.infer<typeof updateUserValidation>
  ) {
    return this.userService.update(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteUser)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.userService.remove(id);
  }
}
