import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserService } from "../service/user.service";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
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
