import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Permissions } from "@common/decorators/permissions.decorator";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserService } from "../service/user.service";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("current-user")
  currentUser(@CurrentUser() user: IUserResponse) {
    return user;
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @Permissions(PermissionType.MenuUser)
  findAll(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.userService.findAllUser(Number(page), Number(limit));
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.userService.remove(id);
  }
}
